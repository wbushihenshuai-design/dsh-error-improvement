/** Standalone DSH host plugin for user-confirmed anti-regression lessons. */
import type { Context } from "@deepseek-ai/cordis";
import type { PreStepDecision } from "@deepseek-ai/dsh-agent";
import { type ErrorImprovementSettings, ErrorImprovementSettingsSchema, type SuccessRecipe } from "./lessons.js";
export declare const name = "dsh-error-improvement";
export declare const inject: string[];
export { ErrorImprovementSettingsSchema };
export type { ErrorImprovementSettings };
export declare function improveDecision(decision: PreStepDecision, aborted: boolean, settings: ErrorImprovementSettings, runtimeRecipes?: readonly SuccessRecipe[]): PreStepDecision;
export declare function apply(ctx: Context): void;
