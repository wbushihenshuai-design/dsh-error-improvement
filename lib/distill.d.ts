/**
 * LLM distillation: turn queued capture candidates into reviewable drafts.
 *
 * Two stages (cognee-style): a Curator call decides per candidate
 * new/duplicate/reject against the existing memory index; a Writer call then
 * drafts entries for the survivors. Everything lands in memory/drafts/ and
 * nothing reaches lessons.md/recipes.md without explicit user confirmation.
 *
 * Red lines honored here: recursion guard (module flag), FLUSH_OK sentinel,
 * whole-candidate budget drops, fail-open on any LLM/parse error.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { PluginConfig } from "./config.js";
import type { ImprovementStore } from "./store.js";
export declare const FLUSH_OK = "FLUSH_OK";
interface LlmTarget {
    provider: string;
    model: string;
}
interface SessionLike {
    requestHeader?: () => {
        config?: {
            provider?: string;
            model?: string;
        };
    } | undefined;
}
export interface DistillOutcome {
    ran: boolean;
    drafts: number;
    reason?: string;
}
export declare function resolveTarget(config: PluginConfig, session?: SessionLike): LlmTarget | undefined;
export declare function maybeDistill(ctx: Context, getConfig: () => PluginConfig, store: ImprovementStore, session?: SessionLike, signal?: AbortSignal): Promise<DistillOutcome>;
export {};
