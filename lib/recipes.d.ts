/**
 * Success recipes: proven solutions captured from earlier fixes.
 * Rendered from the md-native memory layer (kind = "recipe").
 */
import type { PluginConfig } from "./config.js";
import { type Rendered } from "./lessons.js";
import { type MemoryEntry } from "./memory.js";
export declare function selectRecipes(entries: readonly MemoryEntry[], query: string, maximum: number, strict: boolean): MemoryEntry[];
export declare function renderRecipes(entries: readonly MemoryEntry[], query: string, config: Pick<PluginConfig, "mode" | "maxRecipes">, budget: number): Rendered;
export interface RecordRecipeArgs {
    title?: unknown;
    problem?: unknown;
    solution?: unknown;
    scope?: unknown;
    keywords?: unknown;
}
export interface RecordRecipeResult {
    message: string;
    id: string;
}
/** Explicit agent-recorded recipe: written straight into recipes.md (confirmed). */
export declare function recordRecipe(args: RecordRecipeArgs): RecordRecipeResult;
export declare function loadRecipes(): MemoryEntry[];
