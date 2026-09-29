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
import { type ContentBlock } from "./lessons.js";
import type { MemoryEntry } from "./memory.js";
import { type ImprovementStore, type Promotion } from "./store.js";
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
export declare function argsTextOf(exec: ToolExecLike): string;
export declare function errorSample(result: ToolResultLike): string;
export declare function argsOverlap(left: string, right: string): number;
export declare function matchPromotion(promotions: readonly Promotion[], tool: string, argsText: string): Promotion | undefined;
export interface GuardOutcome {
    decision: PreToolDecisionLike;
    warned: boolean;
}
export declare function guardDecision(promotion: Promotion, config: PluginConfig, now: number): GuardOutcome;
export declare function observeToolResult(exec: ToolExecLike, result: ToolResultLike, config: PluginConfig, store: ImprovementStore, lessons: readonly MemoryEntry[]): void;
export declare function mountEnforcement(ctx: Context, getConfig: () => PluginConfig, getLessons: () => MemoryEntry[], store: ImprovementStore, onToolError?: (exec: ToolExecLike, result: ToolResultLike) => void): void;
export {};
