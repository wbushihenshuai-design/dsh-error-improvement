/**
 * Enforcement loop: observe repeated tool failures, promote them into rules,
 * and intercept matching future calls before they execute.
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";

import {
	blocksToText,
	type ErrorImprovementSettings,
	type ErrorLesson,
	PLUGIN_NAME,
	relevanceScore,
} from "./lessons.js";
import {
	type ImprovementStore,
	normalizeText,
	type Promotion,
} from "./store.js";

export interface ToolExecLike {
	name?: unknown;
	arguments?: unknown;
}

export interface ToolResultLike {
	isError?: unknown;
	error?: unknown;
	content?: unknown;
}

export type PreToolDecisionLike =
	| { kind: "allow" }
	| { kind: "deny"; reason: string }
	| { kind: "ask"; reason?: string };

export function argsTextOf(exec: ToolExecLike): string {
	if (exec.arguments == null) return "";
	try {
		return JSON.stringify(exec.arguments).slice(0, 400);
	} catch {
		return String(exec.arguments).slice(0, 400);
	}
}

export function errorSample(result: ToolResultLike): string {
	const parts: string[] = [];
	const failure = result.error as { message?: unknown } | undefined;
	if (failure && typeof failure.message === "string") {
		parts.push(failure.message);
	} else if (result.error != null) {
		parts.push(String(result.error));
	}
	const text = blocksToText(result.content as ContentBlock[] | undefined);
	if (text) parts.push(text);
	return parts.join(" ").slice(0, 300);
}

function tokenSet(value: string): Set<string> {
	const result = new Set<string>();
	for (const token of normalizeText(value, 400).split(" ")) {
		if (token.length >= 3) result.add(token);
	}
	return result;
}

export function argsOverlap(current: string, recorded: string): number {
	const currentNorm = normalizeText(current, 400);
	const recordedNorm = normalizeText(recorded, 400);
	if (!currentNorm && !recordedNorm) return 1;
	if (!currentNorm || !recordedNorm) return 0;
	const a = tokenSet(currentNorm);
	const b = tokenSet(recordedNorm);
	if (a.size === 0 || b.size === 0) return 0;
	let hit = 0;
	for (const token of a) if (b.has(token)) hit += 1;
	return hit / Math.max(a.size, b.size);
}

/** Find the strongest promoted rule matching this upcoming call. */
export function matchPromotion(
	promotions: readonly Promotion[],
	tool: string,
	argsText: string,
): Promotion | undefined {
	let best: Promotion | undefined;
	let bestScore = 0;
	for (const promotion of promotions) {
		if (promotion.tool !== tool) continue;
		const score = argsOverlap(argsText, promotion.argsHint);
		if (score >= 0.34 && score > bestScore) {
			best = promotion;
			bestScore = score;
		}
	}
	return best;
}

export interface GuardOutcome {
	decision: PreToolDecisionLike;
	warned: boolean;
}

export function guardDecision(
	promotion: Promotion | undefined,
	settings: ErrorImprovementSettings,
	now: number,
): GuardOutcome {
	if (!promotion) return { decision: { kind: "allow" }, warned: false };
	if (promotion.mode === "deny") {
		return {
			decision: {
				kind: "deny",
				reason: `Hard anti-regression rule: ${promotion.reason}`,
			},
			warned: false,
		};
	}
	const cooldown =
		typeof settings.enforcement?.warnCooldownMs === "number"
			? settings.enforcement.warnCooldownMs
			: 3_600_000;
	if (!promotion.warnedAt || now - promotion.warnedAt > cooldown) {
		return {
			decision: {
				kind: "deny",
				reason: `Anti-regression reminder (this call is intercepted once as a warning; retrying immediately is allowed): ${promotion.reason}`,
			},
			warned: true,
		};
	}
	return { decision: { kind: "allow" }, warned: false };
}

function bestMatchingLesson(
	settings: ErrorImprovementSettings,
	query: string,
): ErrorLesson | undefined {
	let best: ErrorLesson | undefined;
	let bestScore = 0;
	for (const lesson of settings.lessons ?? []) {
		if (lesson.enabled === false || lesson.confirmed !== true) continue;
		const score = relevanceScore(lesson, query);
		if (score >= 3 && score > bestScore) {
			best = lesson;
			bestScore = score;
		}
	}
	return best;
}

export function observeToolResult(
	exec: ToolExecLike,
	result: ToolResultLike,
	settings: ErrorImprovementSettings,
	store: ImprovementStore,
): void {
	if (settings.enabled === false || settings.enforcement?.enabled === false)
		return;
	if (!result || result.isError !== true) return;
	const tool = typeof exec.name === "string" ? exec.name : "";
	if (!tool) return;
	const sample = errorSample(result);
	if (!sample.trim()) return;

	const argsHint = normalizeText(argsTextOf(exec), 160);
	const { signature, record } = store.recordError(tool, argsHint, sample);
	const threshold =
		typeof settings.enforcement?.threshold === "number"
			? settings.enforcement.threshold
			: 3;
	if (record.count < threshold || store.findPromotion(signature)) return;

	const lesson = bestMatchingLesson(settings, `${tool} ${sample}`);
	const mode = settings.enforcement?.defaultMode ?? "warn";
	const reason = lesson
		? `Rule "${lesson.title}": ${lesson.prevention} (the same tool error has now occurred ${record.count} times; this interception prevents a repeat.)`
		: `Tool ${tool} has failed ${record.count} times with the same error: ${sample.slice(0, 160)}. Do not repeat the call as-is; change approach first (adjust arguments, switch tools, or verify prerequisites).`;
	store.promote(
		{
			signature,
			tool,
			argsHint,
			...(lesson ? { lessonId: lesson.id } : {}),
			mode,
			reason,
			count: record.count,
		},
		typeof settings.enforcement?.maxRules === "number"
			? settings.enforcement.maxRules
			: 20,
	);
}

/** Structural view of the two harness tool events this plugin listens to. */
interface ToolEvents {
	on: {
		(
			event: "tools/post-execute",
			listener: (
				exec: ToolExecLike,
				result: ToolResultLike,
				next: () => Promise<unknown>,
			) => unknown,
		): void;
		(
			event: "tools/pre-execute",
			listener: (
				exec: ToolExecLike,
				next: () => Promise<PreToolDecisionLike>,
			) => unknown,
		): void;
	};
}

export function mountEnforcement(
	ctx: Context,
	currentSettings: () => ErrorImprovementSettings,
	store: ImprovementStore,
): void {
	const events = ctx as unknown as ToolEvents;
	events.on("tools/post-execute", async (exec, result, next) => {
		const decision = await next();
		try {
			observeToolResult(exec, result, currentSettings(), store);
		} catch (error) {
			ctx.logger.warn(
				`${PLUGIN_NAME}: enforcement observer failed open: ${String(error)}`,
			);
		}
		return decision;
	});

	events.on("tools/pre-execute", async (exec, next) => {
		const decision = await next();
		try {
			const settings = currentSettings();
			if (settings.enabled === false || settings.enforcement?.enabled === false)
				return decision;
			if (decision.kind !== "allow") return decision;
			const tool = typeof exec.name === "string" ? exec.name : "";
			if (!tool) return decision;
			const promotion = matchPromotion(
				store.data.promotions,
				tool,
				argsTextOf(exec),
			);
			if (!promotion) return decision;
			const outcome = guardDecision(promotion, settings, Date.now());
			if (outcome.warned) store.markWarned(promotion.signature);
			return outcome.decision;
		} catch (error) {
			ctx.logger.warn(
				`${PLUGIN_NAME}: enforcement guard failed open: ${String(error)}`,
			);
			return decision;
		}
	});
}
