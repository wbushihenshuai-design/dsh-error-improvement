/**
 * dsh-error-improvement — self-evolution entry point (v0.3.0, DSH 2.0.15+).
 *
 * Layers:
 *  - injection   agent/pre-step: relevant confirmed lessons/recipes into context
 *  - enforcement tools/*-execute: statistical interception of repeated errors
 *  - capture     session/event: zero-LLM candidate queue
 *  - signals     hit tracking → maturity → graduation proposals
 *  - distill     LLM Curator→Writer → drafts/ (user confirms each)
 *  - rpc/tools   drafts review for the settings page and the agent
 *
 * Every layer fails open; nothing reaches memory without the confirmation gate.
 */

import type { Context } from "@deepseek-ai/cordis";

import {
	appendCandidates,
	type Candidate,
	CaptureRegistry,
	mountCapture,
} from "./capture.js";
import {
	Config,
	liveConfig,
	PLUGIN_NAME,
	type PluginConfig,
} from "./config.js";
import { maybeDistill } from "./distill.js";
import {
	approveDraft,
	deleteDraft,
	draftStats,
	listDrafts,
	memoryIndex,
	readDraft,
	rejectDraft,
	updateDraft,
	writeDraft,
} from "./drafts.js";
import { mountEnforcement } from "./enforcement.js";
import { graduateEntry, proposeGraduation } from "./graduate.js";
import {
	directUserQuery,
	isLessonMessage,
	lessonMessage,
	renderLessons,
} from "./lessons.js";
import { readEntries } from "./memory.js";
import { runMigration } from "./migrate.js";
import { memoryFile } from "./paths.js";
import { loadRecipes, recordRecipe, renderRecipes } from "./recipes.js";
import { newTurnSignals, SignalsRegistry, settleTurn } from "./signals.js";
import { ImprovementStore } from "./store.js";

export const name = PLUGIN_NAME;
export { Config };
export const inject = ["agents", "llm", "tools", "connection"];

interface MessageLike {
	role?: string;
	source?: { kind?: string; plugin?: string };
	content?: unknown;
}

interface PreStepPayload {
	agent?: { session?: { id?: string; requestHeader?: () => unknown } };
	messages?: MessageLike[];
	signal?: AbortSignal;
	step?: number;
}

function sessionKeyOf(payload: PreStepPayload): string {
	return payload.agent?.session?.id ?? "global";
}

/** cordis event names used by this plugin are declared by other services' typings;
 *  subscribe through a structural view to stay version-tolerant. */
interface EventBus {
	on(event: string, listener: (...args: never[]) => unknown): void;
}

function onEvent(
	ctx: Context,
	event: string,
	listener: (...args: never[]) => unknown,
): void {
	(ctx as unknown as EventBus).on(event, listener);
}

function buildInjection(
	config: PluginConfig,
	messages: MessageLike[],
): { messages: MessageLike[]; ids: string[] } {
	const query = directUserQuery(messages as never);
	const lessons = readEntries(memoryFile("lessons"), "lesson");
	const recipes = loadRecipes();
	const renderedLessons = renderLessons(lessons, query, config);
	const renderedRecipes = renderRecipes(
		recipes,
		query,
		config,
		Math.max(0, config.maxChars - renderedLessons.text.length),
	);
	const injected: MessageLike[] = [];
	const ids: string[] = [];
	if (renderedLessons.text) {
		injected.push(
			lessonMessage(renderedLessons.text) as unknown as MessageLike,
		);
		ids.push(...renderedLessons.ids);
	}
	if (renderedRecipes.text) {
		injected.push(
			lessonMessage(renderedRecipes.text) as unknown as MessageLike,
		);
		ids.push(...renderedRecipes.ids);
	}
	return { messages: injected, ids };
}

export function apply(ctx: Context, config: unknown): void {
	const getConfig = liveConfig(() => config);
	const store = new ImprovementStore();
	runMigration(store, ctx.logger);

	const capture = new CaptureRegistry();
	const signals = new SignalsRegistry();
	const turnStartedAt = new Map<string, number>();

	// ── injection (agent/pre-step waterfall) ────────────────────────────────
	onEvent(ctx, "agent/pre-step", (async (
		payload: PreStepPayload,
		next: () => Promise<unknown>,
	) => {
		try {
			const cfg = getConfig();
			turnStartedAt.set(sessionKeyOf(payload), Date.now());
			if (!cfg.enabled || cfg.mode === "off") return await next();
			const messages = payload.messages ?? [];
			const last = messages[messages.length - 1];
			if (last && isLessonMessage(last as never)) return await next();
			const built = buildInjection(cfg, messages);
			if (built.messages.length === 0) return await next();
			messages.push(...built.messages);
			signals.present(sessionKeyOf(payload), built.ids);
		} catch (error) {
			ctx.logger.warn(
				`${PLUGIN_NAME}: injection failed open: ${String(error)}`,
			);
		}
		return next();
	}) as never);

	// ── enforcement (statistics-driven tool guard) ──────────────────────────
	mountEnforcement(
		ctx,
		getConfig,
		() => readEntries(memoryFile("lessons"), "lesson"),
		store,
	);

	// ── tool-result counters for runtime signals ────────────────────────────
	onEvent(ctx, "session/event", ((
		session: { id?: string },
		event: { type?: string; data?: { result?: { isError?: boolean } } },
	) => {
		try {
			if (event.type !== "tool/result") return;
			const bucket = signals.get(session.id ?? "global");
			if (event.data?.result?.isError === true) bucket.failedTools += 1;
			else bucket.successfulTools += 1;
		} catch {
			// fail-open
		}
	}) as never);

	// ── capture + settle + distill trigger ──────────────────────────────────
	mountCapture(ctx, getConfig, capture, (session, candidates: Candidate[]) => {
		appendCandidates(candidates);
		const key = session.id ?? "global";
		const bucket = signals.drop(key) ?? newTurnSignals();
		bucket.newPromotions = store.data.promotions.filter(
			(rule) => rule.promotedAt >= (turnStartedAt.get(key) ?? 0),
		).length;
		turnStartedAt.delete(key);
		const cfg = getConfig();
		const settled = settleTurn(bucket, cfg.graduation.minHits);
		if (cfg.graduation.enabled) {
			const existing = new Set(
				listDrafts().map((draft) => draft.entry.attributedTo),
			);
			for (const { entry } of settled.graduatable) {
				const marker = `graduation-proposal:${entry.id}`;
				if (existing.has(marker)) continue;
				const proposal = proposeGraduation(entry);
				writeDraft(proposal, "graduation");
				ctx.logger.info(
					`${PLUGIN_NAME}: graduation proposed for "${entry.title}" (${entry.hits} hits)`,
				);
			}
		}
		void maybeDistill(ctx, getConfig, store, session as never);
	});

	// ── tools (guarded: plugin still boots if the service is absent) ────────
	try {
		ctx.inject(["tools"], (injected) => {
			registerRecipeTool(injected);
			registerReviewTool(injected);
		});
	} catch (error) {
		ctx.logger.warn(
			`${PLUGIN_NAME}: tools service unavailable, skipped: ${String(error)}`,
		);
	}

	// ── client RPC for the settings-page drafts section ─────────────────────
	try {
		ctx.inject(["connection"], (injected) => {
			registerRpc(injected, store);
		});
	} catch (error) {
		ctx.logger.warn(
			`${PLUGIN_NAME}: connection service unavailable, skipped: ${String(error)}`,
		);
	}

	onEvent(ctx, "dispose", (() => store.flush()) as never);
}

interface ToolsServiceLike {
	register(definition: Record<string, unknown>): () => void;
}

function registerRecipeTool(ctx: Context): void {
	const tools = (ctx as unknown as { tools?: ToolsServiceLike }).tools;
	if (!tools?.register) return;
	tools.register({
		name: "improve_record_recipe",
		description:
			"Record a proven, reusable solution (success recipe) into long-term memory after fixing a non-trivial problem. Only record durable, generalizable solutions; one-off fixes do not belong here.",
		parameters: {
			type: "object",
			properties: {
				title: {
					type: "string",
					required: true,
					description: "Short recipe name (≤60 chars).",
				},
				problem: {
					type: "string",
					required: true,
					description: "The problem that was solved.",
				},
				solution: {
					type: "string",
					required: true,
					description: "The proven solution, concrete enough to reuse.",
				},
				scope: {
					type: "string",
					required: false,
					description: "Where this recipe applies.",
				},
				keywords: {
					type: "string",
					required: false,
					description: "3-8 lowercase search terms.",
				},
			},
		},
		timeoutMs: 10_000,
		output: {
			schema: { type: "object", properties: { message: { type: "string" } } },
			render: (value: { message: string }) => value.message,
		},
		execute: async (args: Record<string, unknown>) => {
			try {
				return recordRecipe(args);
			} catch (error) {
				return { message: `NOT RECORDED: ${String(error)}`, id: "" };
			}
		},
	});
}

function registerReviewTool(ctx: Context): void {
	const tools = (ctx as unknown as { tools?: ToolsServiceLike }).tools;
	if (!tools?.register) return;
	tools.register({
		name: "improve_review_drafts",
		description:
			"List pending self-evolution drafts (learned lessons/recipes awaiting user confirmation) and resolve them. Drafts only take effect after explicit approval — by the user in settings, or here when the user has clearly asked for it.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					required: true,
					description: "list | approve | reject",
				},
				id: {
					type: "string",
					required: false,
					description: "Draft id for approve/reject.",
				},
				reason: {
					type: "string",
					required: false,
					description: "Optional rejection reason.",
				},
			},
		},
		timeoutMs: 15_000,
		output: {
			schema: { type: "object", properties: { message: { type: "string" } } },
			render: (value: { message: string }) => value.message,
		},
		execute: async (args: {
			action?: string;
			id?: string;
			reason?: string;
		}) => {
			try {
				const action = args.action ?? "list";
				if (action === "list") {
					const drafts = listDrafts();
					if (drafts.length === 0) return { message: "No pending drafts." };
					const lines = drafts.map(
						(draft) =>
							`- ${draft.id} [${draft.kind}] ${draft.entry.title} (from: ${draft.from})`,
					);
					return {
						message: `${drafts.length} pending draft(s):\n${lines.join("\n")}`,
					};
				}
				if (!args.id) return { message: "id is required for approve/reject." };
				if (action === "approve") {
					const draft = readDraft(args.id);
					if (!draft) return { message: `Draft ${args.id} not found.` };
					if (draft.from === "graduation") {
						const sourceId = draft.entry.attributedTo.replace(
							"graduation-proposal:",
							"",
						);
						const index = memoryIndex();
						const source = [...index.lessons, ...index.recipes].find(
							(entry) => entry.id === sourceId,
						);
						if (!source)
							return { message: `Source entry ${sourceId} no longer exists.` };
						const result = graduateEntry(source);
						if (result.ok) deleteDraft(args.id);
						return { message: result.message };
					}
					const entry = approveDraft(args.id);
					return {
						message: entry
							? `Approved: ${entry.title} is now an active ${entry.kind}.`
							: `Draft ${args.id} not found.`,
					};
				}
				if (action === "reject") {
					return {
						message: rejectDraft(args.id, args.reason ?? "")
							? `Draft ${args.id} rejected.`
							: `Draft ${args.id} not found.`,
					};
				}
				return { message: `Unknown action: ${action}` };
			} catch (error) {
				return { message: `review failed open: ${String(error)}` };
			}
		},
	});
}

interface ConnectionServiceLike {
	rpc?: {
		handle(
			channel: string,
			handler: (endpoint: string, payload: unknown) => unknown,
		): void;
	};
}

function registerRpc(ctx: Context, store: ImprovementStore): void {
	const connection = (ctx as unknown as { connection?: ConnectionServiceLike })
		.connection;
	if (!connection?.rpc?.handle) return;
	connection.rpc.handle("/error-improvement", (endpoint, payload) => {
		const body = (payload ?? {}) as Record<string, unknown>;
		switch (endpoint) {
			case "drafts.list":
				return { drafts: listDrafts() };
			case "drafts.get": {
				const draft = readDraft(String(body.id ?? ""));
				return draft ? { draft } : { error: "not-found" };
			}
			case "drafts.approve": {
				const id = String(body.id ?? "");
				const draft = readDraft(id);
				if (!draft) return { ok: false, error: "not-found" };
				if (draft.from === "graduation") {
					const sourceId = draft.entry.attributedTo.replace(
						"graduation-proposal:",
						"",
					);
					const index = memoryIndex();
					const source = [...index.lessons, ...index.recipes].find(
						(entry) => entry.id === sourceId,
					);
					if (!source) return { ok: false, error: "source-missing" };
					const result = graduateEntry(source);
					if (result.ok) deleteDraft(id);
					return { ok: result.ok, message: result.message };
				}
				const entry = approveDraft(id);
				return entry ? { ok: true, entry } : { ok: false, error: "not-found" };
			}
			case "drafts.reject":
				return {
					ok: rejectDraft(String(body.id ?? ""), String(body.reason ?? "")),
				};
			case "drafts.update":
				return {
					draft: updateDraft(
						String(body.id ?? ""),
						(body.patch ?? {}) as never,
					),
				};
			case "memory.stats": {
				const index = memoryIndex();
				return {
					lessons: index.lessons.length,
					recipes: index.recipes.length,
					drafts: draftStats().pending,
					promotions: store.data.promotions.length,
				};
			}
			default:
				return { error: `unknown endpoint: ${endpoint}` };
		}
	});
}
