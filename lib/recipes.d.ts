/** Success recipes: proven solutions captured from earlier fixes. */
import { type UserMessage } from "@deepseek-ai/dsh-llm";
import { type ErrorImprovementSettings, type SuccessRecipe } from "./lessons.js";
import type { ImprovementStore } from "./store.js";
export declare function completeRecipes(recipes: readonly SuccessRecipe[]): SuccessRecipe[];
export declare function selectRecipes(recipes: readonly SuccessRecipe[], query: string, maximum: number, strict: boolean): SuccessRecipe[];
export declare function renderRecipes(recipes: readonly SuccessRecipe[], query: string, budget: number, maximum: number, strict: boolean): string | undefined;
export declare function skillsRoot(): string;
export declare function recipeSlug(title: string, fallbackId: string): string;
/** Graduate a recipe into a standalone DSH skill file. Returns the file path. */
export declare function graduateRecipe(recipe: SuccessRecipe): string;
/** Combined lessons + success-recipes rendering within the shared budget. */
export declare function renderAll(settings: ErrorImprovementSettings, query: string, runtimeRecipes?: readonly SuccessRecipe[]): string | undefined;
/** Lesson/recipe injection message; drop-in replacement for lessonMessage. */
export declare function improvementMessage(settings: ErrorImprovementSettings, messages: readonly UserMessage[], runtimeRecipes?: readonly SuccessRecipe[]): UserMessage | undefined;
export interface RecordRecipeArgs {
    title: string;
    problem: string;
    solution: string;
    scope?: string;
    keywords?: string;
    asSkill?: boolean;
}
export declare function recordRecipe(store: ImprovementStore, args: RecordRecipeArgs): {
    message: string;
    id: string;
    skillPath?: string;
};
