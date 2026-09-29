/**
 * Plugin configuration declared via the cordis `Config` convention.
 *
 * Every field carries a default so the loader's `~standard` validation never
 * throws at boot. Live knobs are marked `.volatile()` so the desktop settings
 * page can update them without remounting the plugin; volatile values arrive
 * wrapped in `{ get() }` references and are flattened by `unwrapConfig()`.
 */
import z from "@deepseek-ai/schemastery";
export declare const PLUGIN_NAME = "dsh-error-improvement";
declare const DEFAULTS: {
    enabled: boolean;
    mode: "assist" | "strict" | "off";
    maxLessons: number;
    maxChars: number;
    maxRecipes: number;
    enforcement: {
        enabled: boolean;
        threshold: number;
        defaultMode: "warn" | "deny";
        warnCooldownMs: number;
        maxRules: number;
    };
    capture: {
        enabled: boolean;
        distillEnabled: boolean;
        minQueueSize: number;
        minIntervalMs: number;
        provider: string;
        model: string;
        maxCandidateChars: number;
    };
    graduation: {
        enabled: boolean;
        minHits: number;
    };
};
export type PluginConfig = typeof DEFAULTS;
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    mode: z<"assist" | "strict" | "off", "assist" | "strict" | "off", "defined">;
    maxLessons: z<number, number, "volatile-defined">;
    maxChars: z<number, number, "volatile-defined">;
    maxRecipes: z<number, number, "volatile-defined">;
    enforcement: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        threshold: z<number, number, "volatile-defined">;
        defaultMode: z<"warn" | "deny", "warn" | "deny", "volatile-defined">;
        warnCooldownMs: z<number, number, "volatile-defined">;
        maxRules: z<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        threshold: z<number, number, "volatile-defined">;
        defaultMode: z<"warn" | "deny", "warn" | "deny", "volatile-defined">;
        warnCooldownMs: z<number, number, "volatile-defined">;
        maxRules: z<number, number, "volatile-defined">;
    }>>, "defined">;
    capture: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        distillEnabled: z<boolean, boolean, "volatile-defined">;
        minQueueSize: z<number, number, "volatile-defined">;
        minIntervalMs: z<number, number, "volatile-defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        maxCandidateChars: z<number, number, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        distillEnabled: z<boolean, boolean, "volatile-defined">;
        minQueueSize: z<number, number, "volatile-defined">;
        minIntervalMs: z<number, number, "volatile-defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        maxCandidateChars: z<number, number, "defined">;
    }>>, "defined">;
    graduation: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        minHits: z<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        minHits: z<number, number, "volatile-defined">;
    }>>, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    mode: z<"assist" | "strict" | "off", "assist" | "strict" | "off", "defined">;
    maxLessons: z<number, number, "volatile-defined">;
    maxChars: z<number, number, "volatile-defined">;
    maxRecipes: z<number, number, "volatile-defined">;
    enforcement: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        threshold: z<number, number, "volatile-defined">;
        defaultMode: z<"warn" | "deny", "warn" | "deny", "volatile-defined">;
        warnCooldownMs: z<number, number, "volatile-defined">;
        maxRules: z<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        threshold: z<number, number, "volatile-defined">;
        defaultMode: z<"warn" | "deny", "warn" | "deny", "volatile-defined">;
        warnCooldownMs: z<number, number, "volatile-defined">;
        maxRules: z<number, number, "volatile-defined">;
    }>>, "defined">;
    capture: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        distillEnabled: z<boolean, boolean, "volatile-defined">;
        minQueueSize: z<number, number, "volatile-defined">;
        minIntervalMs: z<number, number, "volatile-defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        maxCandidateChars: z<number, number, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        distillEnabled: z<boolean, boolean, "volatile-defined">;
        minQueueSize: z<number, number, "volatile-defined">;
        minIntervalMs: z<number, number, "volatile-defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        maxCandidateChars: z<number, number, "defined">;
    }>>, "defined">;
    graduation: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        minHits: z<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "volatile-defined">;
        minHits: z<number, number, "volatile-defined">;
    }>>, "defined">;
}>>, "plain">;
/** Flatten the loader-validated config (volatile refs included) into plain values. */
export declare function unwrapConfig(raw: unknown): PluginConfig;
/** Re-read volatile fields on every access so live settings edits take effect. */
export declare function liveConfig(getRaw: () => unknown): () => PluginConfig;
export {};
