/**
 * Plugin configuration declared via the cordis `Config` convention.
 *
 * Every field carries a default so the loader's `~standard` validation never
 * throws at boot. Live knobs are marked `.volatile()` so the desktop settings
 * page can update them without remounting the plugin; volatile values arrive
 * wrapped in `{ get() }` references and are flattened by `unwrapConfig()`.
 */
import z from "@deepseek-ai/schemastery";
export const PLUGIN_NAME = "dsh-error-improvement";
const DEFAULTS = {
    enabled: true,
    mode: "assist",
    maxLessons: 5,
    maxChars: 6000,
    maxRecipes: 3,
    enforcement: {
        enabled: true,
        threshold: 3,
        defaultMode: "warn",
        warnCooldownMs: 3_600_000,
        maxRules: 20,
    },
    capture: {
        enabled: true,
        distillEnabled: true,
        minQueueSize: 3,
        minIntervalMs: 1_800_000,
        provider: "",
        model: "",
        maxCandidateChars: 16_000,
    },
    graduation: {
        enabled: true,
        minHits: 3,
    },
};
export const Config = z.object({
    enabled: z
        .boolean()
        .default(DEFAULTS.enabled)
        .description("Master switch for injection, enforcement, capture and graduation.")
        .volatile(),
    mode: z
        .union(["assist", "strict", "off"])
        .default(DEFAULTS.mode)
        .description("assist = inject relevant lessons as advice; strict = inject all confirmed lessons as rules; off = capture only, no injection."),
    maxLessons: z
        .number()
        .min(1)
        .max(50)
        .default(DEFAULTS.maxLessons)
        .description("Maximum lessons injected per turn.")
        .volatile(),
    maxChars: z
        .number()
        .min(500)
        .max(50_000)
        .default(DEFAULTS.maxChars)
        .description("Hard character budget for the lessons + recipes injection block.")
        .volatile(),
    maxRecipes: z
        .number()
        .min(0)
        .max(20)
        .default(DEFAULTS.maxRecipes)
        .description("Maximum success recipes injected per turn.")
        .volatile(),
    enforcement: z
        .object({
        enabled: z
            .boolean()
            .default(DEFAULTS.enforcement.enabled)
            .description("Intercept tool calls that repeat a known failure signature.")
            .volatile(),
        threshold: z
            .number()
            .min(2)
            .max(10)
            .default(DEFAULTS.enforcement.threshold)
            .description("Identical tool errors before a runtime rule is promoted.")
            .volatile(),
        defaultMode: z
            .union(["warn", "deny"])
            .default(DEFAULTS.enforcement.defaultMode)
            .description("warn = intercept once per cooldown; deny = block repeats.")
            .volatile(),
        warnCooldownMs: z
            .number()
            .min(60_000)
            .max(86_400_000)
            .default(DEFAULTS.enforcement.warnCooldownMs)
            .description("Minimum interval between two warnings of the same rule.")
            .volatile(),
        maxRules: z
            .number()
            .min(1)
            .max(100)
            .default(DEFAULTS.enforcement.maxRules)
            .description("Cap of runtime auto-rules; oldest unlinked rules are evicted.")
            .volatile(),
    })
        .default(DEFAULTS.enforcement)
        .collapse(),
    capture: z
        .object({
        enabled: z
            .boolean()
            .default(DEFAULTS.capture.enabled)
            .description("Observe turns and queue candidate lessons/recipes (no LLM).")
            .volatile(),
        distillEnabled: z
            .boolean()
            .default(DEFAULTS.capture.distillEnabled)
            .description("Periodically distill the queue into user-confirmation drafts (LLM).")
            .volatile(),
        minQueueSize: z
            .number()
            .min(1)
            .max(50)
            .default(DEFAULTS.capture.minQueueSize)
            .description("Minimum queued candidates before a distillation run.")
            .volatile(),
        minIntervalMs: z
            .number()
            .min(60_000)
            .max(86_400_000)
            .default(DEFAULTS.capture.minIntervalMs)
            .description("Minimum interval between two distillation runs.")
            .volatile(),
        provider: z
            .string()
            .max(200)
            .default(DEFAULTS.capture.provider)
            .description("LLM provider for distillation; empty = the turn's routed provider."),
        model: z
            .string()
            .max(200)
            .default(DEFAULTS.capture.model)
            .description("LLM model for distillation; empty = the turn's routed model."),
        maxCandidateChars: z
            .number()
            .min(1000)
            .max(100_000)
            .default(DEFAULTS.capture.maxCandidateChars)
            .description("Character budget of candidates fed into one distillation run."),
    })
        .default(DEFAULTS.capture)
        .collapse(),
    graduation: z
        .object({
        enabled: z
            .boolean()
            .default(DEFAULTS.graduation.enabled)
            .description("Propose turning validated experience into reusable SKILL.md files.")
            .volatile(),
        minHits: z
            .number()
            .min(1)
            .max(100)
            .default(DEFAULTS.graduation.minHits)
            .description("Hits before a validated entry is proposed for skill graduation.")
            .volatile(),
    })
        .default(DEFAULTS.graduation)
        .collapse(),
});
function unref(value) {
    if (value !== null &&
        typeof value === "object" &&
        typeof value.get === "function") {
        return value.get();
    }
    return value;
}
/** Flatten the loader-validated config (volatile refs included) into plain values. */
export function unwrapConfig(raw) {
    const input = (raw ?? {});
    const enforcement = (input.enforcement ?? {});
    const capture = (input.capture ?? {});
    const graduation = (input.graduation ?? {});
    return {
        enabled: unref(input.enabled) ?? DEFAULTS.enabled,
        mode: (unref(input.mode) ?? DEFAULTS.mode),
        maxLessons: unref(input.maxLessons) ?? DEFAULTS.maxLessons,
        maxChars: unref(input.maxChars) ?? DEFAULTS.maxChars,
        maxRecipes: unref(input.maxRecipes) ?? DEFAULTS.maxRecipes,
        enforcement: {
            enabled: unref(enforcement.enabled) ?? DEFAULTS.enforcement.enabled,
            threshold: unref(enforcement.threshold) ?? DEFAULTS.enforcement.threshold,
            defaultMode: (unref(enforcement.defaultMode) ??
                DEFAULTS.enforcement.defaultMode),
            warnCooldownMs: unref(enforcement.warnCooldownMs) ??
                DEFAULTS.enforcement.warnCooldownMs,
            maxRules: unref(enforcement.maxRules) ?? DEFAULTS.enforcement.maxRules,
        },
        capture: {
            enabled: unref(capture.enabled) ?? DEFAULTS.capture.enabled,
            distillEnabled: unref(capture.distillEnabled) ??
                DEFAULTS.capture.distillEnabled,
            minQueueSize: unref(capture.minQueueSize) ?? DEFAULTS.capture.minQueueSize,
            minIntervalMs: unref(capture.minIntervalMs) ?? DEFAULTS.capture.minIntervalMs,
            provider: unref(capture.provider) ?? DEFAULTS.capture.provider,
            model: unref(capture.model) ?? DEFAULTS.capture.model,
            maxCandidateChars: unref(capture.maxCandidateChars) ??
                DEFAULTS.capture.maxCandidateChars,
        },
        graduation: {
            enabled: unref(graduation.enabled) ?? DEFAULTS.graduation.enabled,
            minHits: unref(graduation.minHits) ?? DEFAULTS.graduation.minHits,
        },
    };
}
/** Re-read volatile fields on every access so live settings edits take effect. */
export function liveConfig(getRaw) {
    return () => unwrapConfig(getRaw());
}
