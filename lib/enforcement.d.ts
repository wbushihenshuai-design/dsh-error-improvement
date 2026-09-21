/**
 * Enforcement loop: observe repeated tool failures, promote them into rules,
 * and intercept matching future calls before they execute.
 */
import type { Context } from "@deepseek-ai/cordis";
import { type ErrorImprovementSettings } from "./lessons.js";
import { type ImprovementStore, type Promotion } from "./store.js";
export interface ToolExecLike {
    name?: unknown;
    arguments?: unknown;
}
export interface ToolResultLike {
    isError?: unknown;
    error?: unknown;
    content?: unknown;
}
export type PreToolDecisionLike = {
    kind: "allow";
} | {
    kind: "deny";
    reason: string;
} | {
    kind: "ask";
    reason?: string;
};
export declare function argsTextOf(exec: ToolExecLike): string;
export declare function errorSample(result: ToolResultLike): string;
export declare function argsOverlap(current: string, recorded: string): number;
/** Find the strongest promoted rule matching this upcoming call. */
export declare function matchPromotion(promotions: readonly Promotion[], tool: string, argsText: string): Promotion | undefined;
export interface GuardOutcome {
    decision: PreToolDecisionLike;
    warned: boolean;
}
export declare function guardDecision(promotion: Promotion | undefined, settings: ErrorImprovementSettings, now: number): GuardOutcome;
export declare function observeToolResult(exec: ToolExecLike, result: ToolResultLike, settings: ErrorImprovementSettings, store: ImprovementStore): void;
export declare function mountEnforcement(ctx: Context, currentSettings: () => ErrorImprovementSettings, store: ImprovementStore): void;
