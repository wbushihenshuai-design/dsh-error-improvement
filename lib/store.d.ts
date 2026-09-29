/**
 * Persistent runtime state (JSON): error statistics, promoted guard rules,
 * distillation watermarks and one-time migration flags.
 *
 * Version 2 drops the embedded `recipes` list — recipes now live in the
 * md-native memory layer. Recipes found in a legacy v1 state file are kept in
 * the transient `legacyRecipes` field until migrate.ts moves them over.
 */
export interface ErrorRecord {
    tool: string;
    argsHint: string;
    count: number;
    firstAt: number;
    lastAt: number;
    sample: string;
}
export interface Promotion {
    signature: string;
    tool: string;
    argsHint: string;
    lessonId?: string;
    mode: "warn" | "deny";
    reason: string;
    count: number;
    promotedAt: number;
    warnedAt?: number;
}
/** Legacy v1 shape kept only for migration. */
export interface RuntimeRecipe {
    id: string;
    title: string;
    problem: string;
    solution: string;
    scope: string;
    keywords: string;
    confirmed: boolean;
    enabled: boolean;
    createdAt: string;
}
export interface DistillState {
    /** Byte offset into candidates.jsonl already processed. */
    watermark: number;
    lastRunAt: number;
}
export interface MigrationFlags {
    settingsYaml: boolean;
    stateRecipes: boolean;
}
export interface ImprovementState {
    version: 2;
    errors: Record<string, ErrorRecord>;
    promotions: Promotion[];
    distill: DistillState;
    migrated: MigrationFlags;
}
export declare function normalizeText(value: string, max?: number): string;
export declare function errorSignature(tool: string, sample: string): string;
export declare class ImprovementStore {
    readonly path: string;
    private state;
    /** Transient: recipes recovered from a v1 file, consumed by migrate.ts. */
    legacyRecipes: RuntimeRecipe[];
    private timer;
    constructor(path?: string);
    private load;
    get data(): ImprovementState;
    flush(): void;
    scheduleSave(): void;
    recordError(tool: string, argsHint: string, sample: string): {
        signature: string;
        record: ErrorRecord;
    };
    findPromotion(signature: string): Promotion | undefined;
    promote(rule: Omit<Promotion, "promotedAt">, maxRules: number): Promotion;
    markWarned(signature: string): void;
}
