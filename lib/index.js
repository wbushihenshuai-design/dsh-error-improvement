/** Standalone DSH host plugin for user-confirmed anti-regression lessons. */
import { ConfigurableCompactionEngine } from "./compaction.js";
import { builtinLessons, defaultSettings, ErrorImprovementSettingsSchema, lessonMessage, PLUGIN_NAME, SETTINGS_NAMESPACE, } from "./lessons.js";
export const name = PLUGIN_NAME;
// `compaction` must not be a module-level dependency: this plugin replaces the
// base implementation once it becomes available through the scoped callback.
export const inject = ["agents", "settings"];
export { ErrorImprovementSettingsSchema };
export function improveDecision(decision, step, aborted, settings) {
    if (decision.kind === "reject" ||
        aborted ||
        step !== 1 ||
        decision.messages.length === 0) {
        return decision;
    }
    const message = lessonMessage(settings, decision.messages);
    if (!message)
        return decision;
    return { ...decision, messages: [...decision.messages, message] };
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
    ctx.on("agent/pre-step", async ({ signal, step }, next) => {
        const decision = await next();
        try {
            return improveDecision(decision, step, signal.aborted, currentSettings());
        }
        catch (error) {
            ctx.logger.warn(`${PLUGIN_NAME}: lesson injection failed open: ${String(error)}`);
            return decision;
        }
    }, { prepend: true });
    // Register the configurable compaction engine (overrides dsh-compaction-basic).
    ctx.inject(["compaction"], (compactionCtx) => {
        try {
            const engine = new ConfigurableCompactionEngine(ctx, currentSettings);
            compactionCtx.compaction = engine;
        }
        catch (error) {
            ctx.logger.warn(`${PLUGIN_NAME}: compaction engine registration failed: ${String(error)}`);
        }
    });
    ctx.logger.info(`${PLUGIN_NAME}: active; settings namespace=${SETTINGS_NAMESPACE}; compaction=on`);
}
