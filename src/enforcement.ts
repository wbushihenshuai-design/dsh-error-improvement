/**
 * Runtime enforcement: statistics-driven interception of repeated tool errors.
 *
 * post-execute: identical tool errors are counted by signature; at the
 * configured threshold a guard rule is promoted (linked to the best matching
 * memory lesson when one exists).
 * pre-execute: a promoted rule either warns once per cooldown or denies.
 * Every listener fails open.
 */

import type { Context } from "@deepseek-ai/cordis";

import type { PluginConfig } from "./config.js";
import { blocksToText, type ContentBlock, relevanceScore } from "./lessons.js";
import type { MemoryEntry } from "./memory.js";
import {
	type ImprovementStore,
	normalizeText,
	type Promotion,
} from "./store.js";

interface ToolExecLike {
	name?: unknown;
	parameters?: unknown;
	args?: unknown;
	input?: unknown;
}

interface ToolResultLike {
	isError?: boolean;
	content?: ContentBlock[];
	error?: unknown;
}

interface PreToolDecisionLike {
	kind: "allow" | "deny" | string;
	reason?: string;
	[key: string]: unknown;
}

export function argsTextOf(exec: ToolExecLike): string {
	const raw = exec.parameters ?? exec.args ?? exec.input;
	if (raw === undefined || raw === null) return "";
	try {
		return JSON.stringify(raw).slice(0, 400);
	} catch {
		return String(raw).slice(0, 400);
	}
}

export function errorSample(result: ToolResultLike): string {
	const parts: string[] = [];
	if (result.error instanceof Error) parts.push(result.error.message);
	else if (typeof result.error === "string") parts.push(result.error);
	const text = blocksToText(result.content);
	if (text) parts.push(text);
	return parts.join("\n").slice(0, 300);
}

function tokenSet(text: string): Set<string> {
	return new Set(
		normalizeText(text, 400)
			.split(" ")
			.filter((token) => token.length >= 2),
	);
}

export function argsOverlap(left: string, right: string): number {
	const a = tokenSet(left);
	const b = tokenSet(right);
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const token of a) if (b.has(token)) intersection += 1;
	return intersection / Math.max(a.size, b.size);
}

export function matchPromotion(
	promotions: readonly Promotion[],
	tool: string,
	argsText: string,
): Promotion | undefined {
	let best: Promotion | undefined;
	let bestScore = 0;
	for (const promotion of promotions) {
		if (promotion.tool !== tool) continue;
		const overlap = argsOverlap(argsText, promotion.argsHint);
		if (overlap >= 0.34 && overlap > bestScore) {
			best = promotion;
			bestScore = overlap;
		}
	}
	return best;
}

export interface GuardOutcome {
	decision: PreToolDecisionLike;
	warned: boolean;
}

export function guardDecision(
	promotion: Promotion,
	config: PluginConfig,
	now: number,
): GuardOutcome {
	if (promotion.mode === "deny") {
		return {
			decision: {
				kind: "deny",
				reason: `Blocked by error-improvement rule: ${promotion.reason}`,
			},
			warned: false,
		};
	}
	const cooldown = config.enforcement.warnCooldownMs;
	if (!promotion.warnedAt || now - promotion.warnedAt >= cooldown) {
		return {
			decision: {
				kind: "deny",
				reason: `Anti-regression reminder (intercepted once as a warning; retrying immediately is allowed): ${promotion.reason}`,
			},
			warned: true,
		};
	}
	return { decision: { kind: "allow" }, warned: false };
}

function bestMatchingLesson(
	lessons: readonly MemoryEntry[],
	query: string,
): MemoryEntry | undefined {
	let best: MemoryEntry | undefined;
	let bestScore = 0;
	for (const lesson of lessons) {
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
	config: PluginConfig,
	store: ImprovementStore,
	lessons: readonly MemoryEntry[],
): void {
	if (config.enabled === false || config.enforcement.enabled === false) return;
	if (!result || result.isError !== true) return;
	const tool = typeof exec.name === "string" ? exec.name : "";
	if (!tool) return;
	const sample = errorSample(result);
	if (!sample.trim()) return;

	const argsHint = normalizeText(argsTextOf(exec), 160);
	const { signature, record } = store.recordError(tool, argsHint, sample);
	if (
		record.count < config.enforcement.threshold ||
		store.findPromotion(signature)
	) {
		return;
	}

	const lesson = bestMatchingLesson(lessons, `${tool} ${sample}`);
	const mode = config.enforcement.defaultMode;
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
		config.enforcement.maxRules,
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
	getConfig: () => PluginConfig,
	getLessons: () => MemoryEntry[],
	store: ImprovementStore,
	onToolError?: (exec: ToolExecLike, result: ToolResultLike) => void,
): void {
	const events = ctx as unknown as ToolEvents;
	events.on("tools/post-execute", async (exec, result, next) => {
		const decision = await next();
		try {
			observeToolResult(exec, result, getConfig(), store, getLessons());
			if (result?.isError === true) onToolError?.(exec, result);
		} catch (error) {
			ctx.logger.warn(
				`dsh-error-improvement: enforcement observer failed open: ${String(error)}`,
			);
		}
		return decision;
	});

	events.on("tools/pre-execute", async (exec, next) => {
		const decision = await next();
		try {
			const config = getConfig();
			if (config.enabled === false || config.enforcement.enabled === false) {
				return decision;
			}
			if (decision.kind !== "allow") return decision;
			const tool = typeof exec.name === "string" ? exec.name : "";
			if (!tool) return decision;
			const promotion = matchPromotion(
				store.data.promotions,
				tool,
				argsTextOf(exec),
			);
			if (!promotion) return decision;
			const outcome = guardDecision(promotion, config, Date.now());
			if (outcome.warned) store.markWarned(promotion.signature);
			return outcome.decision;
		} catch (error) {
			ctx.logger.warn(
				`dsh-error-improvement: enforcement guard failed open: ${String(error)}`,
			);
			return decision;
		}
	});
}
