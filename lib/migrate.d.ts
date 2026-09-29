/**
 * One-shot migration of pre-v0.3.0 data into the md-native memory layer:
 *  - settings.yaml.imported `error-improvement.lessons[]`  → memory/lessons.md
 *  - state.json v1 `recipes[]`                              → memory/recipes.md
 * Also seeds the built-in starter lesson on a fresh install.
 * Idempotent via flags in the state store.
 */
import type { ImprovementStore } from "./store.js";
interface LoggerLike {
    info(message: string): void;
    warn(message: string): void;
}
export declare function seedBuiltinLesson(logger?: LoggerLike): void;
export declare function runMigration(store: ImprovementStore, logger: LoggerLike): void;
export {};
