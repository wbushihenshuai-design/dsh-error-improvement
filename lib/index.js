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
import { appendCandidates, CaptureRegistry, mountCapture, } from "./capture.js";
import { Config, liveConfig, PLUGIN_NAME, } from "./config.js";
import { maybeDistill } from "./distill.js";
import { approveDraft, deleteDraft, draftStats, listDrafts, memoryIndex, readDraft, rejectDraft, updateDraft, writeDraft, } from "./drafts.js";
import { mountEnforcement } from "./enforcement.js";
import { graduateEntry, proposeGraduation } from "./graduate.js";
import { directUserQuery, isLessonMessage, lessonMessage, renderLessons, } from "./lessons.js";
import { readEntries } from "./memory.js";
import { runMigration } from "./migrate.js";
import { memoryFile } from "./paths.js";
import { loadRecipes, recordRecipe, renderRecipes } from "./recipes.js";
import { newTurnSignals, SignalsRegistry, settleTurn } from "./signals.js";
import { ImprovementStore } from "./store.js";
export const name = PLUGIN_NAME;
export { Config };
export const inject = ["agents", "llm", "tools", "connection"];
function sessionKeyOf(payload) {
    return payload.agent?.session?.id ?? "global";
}
function onEvent(ctx, event, listener) {
    ctx.on(event, listener);
}
function buildInjection(config, messages) {
    const query = directUserQuery(messages);
    const lessons = readEntries(memoryFile("lessons"), "lesson");
    const recipes = loadRecipes();
    const renderedLessons = renderLessons(lessons, query, config);
    const renderedRecipes = renderRecipes(recipes, query, config, Math.max(0, config.maxChars - renderedLessons.text.length));
    const injected = [];
    const ids = [];
    if (renderedLessons.text) {
        injected.push(lessonMessage(renderedLessons.text));
        ids.push(...renderedLessons.ids);
    }
    if (renderedRecipes.text) {
        injected.push(lessonMessage(renderedRecipes.text));
        ids.push(...renderedRecipes.ids);
    }
    return { messages: injected, ids };
}
export function apply(ctx, config) {
    const getConfig = liveConfig(() => config);
    const store = new ImprovementStore();
    runMigration(store, ctx.logger);
    const capture = new CaptureRegistry();
    const signals = new SignalsRegistry();
    const turnStartedAt = new Map();
    // ── injection (agent/pre-step waterfall) ────────────────────────────────
    onEvent(ctx, "agent/pre-step", (async (payload, next) => {
        try {
            const cfg = getConfig();
            turnStartedAt.set(sessionKeyOf(payload), Date.now());
            if (!cfg.enabled || cfg.mode === "off")
                return await next();
            const messages = payload.messages ?? [];
            const last = messages[messages.length - 1];
            if (last && isLessonMessage(last))
                return await next();
            const built = buildInjection(cfg, messages);
            if (built.messages.length === 0)
                return await next();
            messages.push(...built.messages);
            signals.present(sessionKeyOf(payload), built.ids);
        }
        catch (error) {
            ctx.logger.warn(`${PLUGIN_NAME}: injection failed open: ${String(error)}`);
        }
        return next();
    }));
    // ── enforcement (statistics-driven tool guard) ──────────────────────────
    mountEnforcement(ctx, getConfig, () => readEntries(memoryFile("lessons"), "lesson"), store);
    // ── tool-result counters for runtime signals ────────────────────────────
    onEvent(ctx, "session/event", ((session, event) => {
        try {
            if (event.type !== "tool/result")
                return;
            const bucket = signals.get(session.id ?? "global");
            if (event.data?.result?.isError === true)
                bucket.failedTools += 1;
            else
                bucket.successfulTools += 1;
        }
        catch {
            // fail-open
        }
    }));
    // ── capture + settle + distill trigger ──────────────────────────────────
    mountCapture(ctx, getConfig, capture, (session, candidates) => {
        appendCandidates(candidates);
        const key = session.id ?? "global";
        const bucket = signals.drop(key) ?? newTurnSignals();
        bucket.newPromotions = store.data.promotions.filter((rule) => rule.promotedAt >= (turnStartedAt.get(key) ?? 0)).length;
        turnStartedAt.delete(key);
        const cfg = getConfig();
        const settled = settleTurn(bucket, cfg.graduation.minHits);
        if (cfg.graduation.enabled) {
            const existing = new Set(listDrafts().map((draft) => draft.entry.attributedTo));
            for (const { entry } of settled.graduatable) {
                const marker = `graduation-proposal:${entry.id}`;
                if (existing.has(marker))
                    continue;
                const proposal = proposeGraduation(entry);
                writeDraft(proposal, "graduation");
                ctx.logger.info(`${PLUGIN_NAME}: graduation proposed for "${entry.title}" (${entry.hits} hits)`);
            }
        }
        void maybeDistill(ctx, getConfig, store, session);
    });
    // ── tools (guarded: plugin still boots if the service is absent) ────────
    try {
        ctx.inject(["tools"], (injected) => {
            registerRecipeTool(injected);
            registerReviewTool(injected);
        });
    }
    catch (error) {
        ctx.logger.warn(`${PLUGIN_NAME}: tools service unavailable, skipped: ${String(error)}`);
    }
    // ── client RPC for the settings-page drafts section ─────────────────────
    // `connection.rpc.handle` registers its route through the READING context
    // (`owner.webServer.register(route)` in @deepseek-ai/dsh-client-connection),
    // so `webServer` must be in this inject scope or cordis throws
    // `cannot get property "webServer" without inject`.
    try {
        ctx.inject(["connection", "webServer"], (injected) => {
            try {
                registerRpc(injected, store);
            }
            catch (error) {
                ctx.logger.warn(`${PLUGIN_NAME}: rpc registration failed open: ${String(error)}`);
            }
        });
    }
    catch (error) {
        ctx.logger.warn(`${PLUGIN_NAME}: connection service unavailable, skipped: ${String(error)}`);
    }
    onEvent(ctx, "dispose", (() => store.flush()));
}
function registerRecipeTool(ctx) {
    const tools = ctx.tools;
    if (!tools?.register)
        return;
    tools.register({
        name: "improve_record_recipe",
        description: "Record a proven, reusable solution (success recipe) into long-term memory after fixing a non-trivial problem. Only record durable, generalizable solutions; one-off fixes do not belong here.",
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
            render: (value) => value.message,
        },
        execute: async (args) => {
            try {
                return recordRecipe(args);
            }
            catch (error) {
                return { message: `NOT RECORDED: ${String(error)}`, id: "" };
            }
        },
    });
}
function registerReviewTool(ctx) {
    const tools = ctx.tools;
    if (!tools?.register)
        return;
    tools.register({
        name: "improve_review_drafts",
        description: "List pending self-evolution drafts (learned lessons/recipes awaiting user confirmation) and resolve them. Drafts only take effect after explicit approval — by the user in settings, or here when the user has clearly asked for it.",
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
            render: (value) => value.message,
        },
        execute: async (args) => {
            try {
                const action = args.action ?? "list";
                if (action === "list") {
                    const drafts = listDrafts();
                    if (drafts.length === 0)
                        return { message: "No pending drafts." };
                    const lines = drafts.map((draft) => `- ${draft.id} [${draft.kind}] ${draft.entry.title} (from: ${draft.from})`);
                    return {
                        message: `${drafts.length} pending draft(s):\n${lines.join("\n")}`,
                    };
                }
                if (!args.id)
                    return { message: "id is required for approve/reject." };
                if (action === "approve") {
                    const draft = readDraft(args.id);
                    if (!draft)
                        return { message: `Draft ${args.id} not found.` };
                    if (draft.from === "graduation") {
                        const sourceId = draft.entry.attributedTo.replace("graduation-proposal:", "");
                        const index = memoryIndex();
                        const source = [...index.lessons, ...index.recipes].find((entry) => entry.id === sourceId);
                        if (!source)
                            return { message: `Source entry ${sourceId} no longer exists.` };
                        const result = graduateEntry(source);
                        if (result.ok)
                            deleteDraft(args.id);
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
            }
            catch (error) {
                return { message: `review failed open: ${String(error)}` };
            }
        },
    });
}
function registerRpc(ctx, store) {
    const connection = ctx
        .connection;
    if (!connection?.rpc?.handle)
        return;
    connection.rpc.handle("/error-improvement", (endpoint, payload) => {
        const body = (payload ?? {});
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
                if (!draft)
                    return { ok: false, error: "not-found" };
                if (draft.from === "graduation") {
                    const sourceId = draft.entry.attributedTo.replace("graduation-proposal:", "");
                    const index = memoryIndex();
                    const source = [...index.lessons, ...index.recipes].find((entry) => entry.id === sourceId);
                    if (!source)
                        return { ok: false, error: "source-missing" };
                    const result = graduateEntry(source);
                    if (result.ok)
                        deleteDraft(id);
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
                    draft: updateDraft(String(body.id ?? ""), (body.patch ?? {})),
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
