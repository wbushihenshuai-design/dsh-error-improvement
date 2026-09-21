/** Standalone DSH host plugin for user-confirmed anti-regression lessons. */
import { ConfigurableCompactionEngine } from "./compaction.js";
import { mountEnforcement } from "./enforcement.js";
import { builtinLessons, defaultSettings, ErrorImprovementSettingsSchema, PLUGIN_NAME, SETTINGS_NAMESPACE, } from "./lessons.js";
import { improvementMessage, recordRecipe } from "./recipes.js";
import { ImprovementStore } from "./store.js";
export const name = PLUGIN_NAME;
// llm/tokenMeter/sessions are required before apply() runs so the compaction
// engine can be constructed synchronously; a nested ctx.inject for them was
// unreliable in the Web host where those services live in a different realm.
export const inject = ["agents", "settings", "llm", "tokenMeter", "sessions"];
export { ErrorImprovementSettingsSchema };
export function improveDecision(decision, aborted, settings, runtimeRecipes = []) {
    if (decision.kind === "reject" || aborted || decision.messages.length === 0) {
        return decision;
    }
    const message = improvementMessage(settings, decision.messages, runtimeRecipes);
    if (!message)
        return decision;
    return { ...decision, messages: [...decision.messages, message] };
}
function registerRecipeTool(ctx, store) {
    try {
        const tools = ctx.tools;
        if (!tools || typeof tools.register !== "function")
            return;
        const dispose = tools.register({
            name: "improve_record_recipe",
            description: "Record a proven solution (success recipe) right after you solve a non-trivial problem, so future tasks reuse it instead of re-deriving the approach. Use only for verified, working solutions — never for guesses or untested ideas. Set asSkill=true to also graduate the recipe into a standalone DSH skill file under the skills directory.",
            parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: {
                        type: "string",
                        required: true,
                        description: "Short name of the solved problem pattern.",
                    },
                    problem: {
                        type: "string",
                        required: true,
                        description: "Symptoms and context of the problem that was solved.",
                    },
                    solution: {
                        type: "string",
                        required: true,
                        description: "The verified working solution, concrete enough to re-apply directly.",
                    },
                    scope: {
                        type: "string",
                        description: "Where this recipe applies (tools, projects, setups).",
                    },
                    keywords: {
                        type: "string",
                        description: "Comma-separated trigger words that should surface this recipe.",
                    },
                    asSkill: {
                        type: "boolean",
                        description: "Also write a SKILL.md into the DSH skills directory so the recipe becomes a first-class skill.",
                    },
                },
            },
            output: {
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        message: { type: "string", required: true },
                        id: { type: "string", required: true },
                        skillPath: { type: "string" },
                    },
                },
                render: (value) => value.message,
            },
            timeoutMs: 10_000,
            execute: async (args) => recordRecipe(store, (args ?? {})),
        });
        ctx.effect?.(() => dispose);
        ctx.logger.info(`${PLUGIN_NAME}: improve_record_recipe tool registered`);
    }
    catch (error) {
        ctx.logger.warn(`${PLUGIN_NAME}: recipe tool registration failed: ${String(error)}`);
    }
}
export function apply(ctx) {
    let currentSettings = () => defaultSettings;
    ctx.inject(["settings"], (settingsCtx) => {
        const settings = settingsCtx
            .settings;
        settings.installSection(ctx, SETTINGS_NAMESPACE, ErrorImprovementSettingsSchema, { ...defaultSettings, lessons: [...builtinLessons] }, {
            setSource: (source) => {
                currentSettings = source;
            },
            onChange: () => { },
        });
    });
    let store;
    try {
        store = new ImprovementStore();
    }
    catch (error) {
        ctx.logger.warn(`${PLUGIN_NAME}: state store unavailable, enforcement and recipes disabled: ${String(error)}`);
    }
    ctx.on("agent/pre-step", async ({ signal }, next) => {
        const decision = await next();
        try {
            return improveDecision(decision, signal.aborted, currentSettings(), store?.data.recipes ?? []);
        }
        catch (error) {
            ctx.logger.warn(`${PLUGIN_NAME}: lesson injection failed open: ${String(error)}`);
            return decision;
        }
    }, { prepend: true });
    if (store) {
        try {
            mountEnforcement(ctx, currentSettings, store);
            ctx.logger.info(`${PLUGIN_NAME}: enforcement loop mounted`);
        }
        catch (error) {
            ctx.logger.warn(`${PLUGIN_NAME}: enforcement mounting failed: ${String(error)}`);
        }
        registerRecipeTool(ctx, store);
    }
    // Construct the configurable compaction engine directly: llm, tokenMeter,
    // and sessions are guaranteed available by the module-level inject list.
    try {
        new ConfigurableCompactionEngine(ctx, currentSettings);
        ctx.logger.info(`${PLUGIN_NAME}: configurable compaction engine mounted`);
    }
    catch (error) {
        ctx.logger.warn(`${PLUGIN_NAME}: compaction engine registration failed: ${String(error)}`);
    }
    ctx.logger.info(`${PLUGIN_NAME}: active; settings namespace=${SETTINGS_NAMESPACE}; compaction=on`);
}
