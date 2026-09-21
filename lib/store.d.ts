/** Persistent runtime state: error counters, promoted rules, success recipes. */
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
export interface RuntimeRecipe {
    id: string;
    title: string;
    problem: string;
    solution: string;
    scope: string;
    keywords: string;
    confirmed: boolean;
    enabled: boolean;
    createdAt: number;
}
export interface ImprovementState {
    version: 1;
    errors: Record<string, ErrorRecord>;
    promotions: Promotion[];
    recipes: RuntimeRecipe[];
}
export declare function normalizeText(value: string, max?: number): string;
export declare function errorSignature(tool: string, sample: string): string;
export declare function defaultStatePath(): string;
export declare class ImprovementStore {
    readonly path: string;
    private state;
    private dirty;
    private timer;
    constructor(path?: string);
    get data(): Readonly<ImprovementState>;
    private load;
    recordError(tool: string, argsHint: string, sample: string): {
        signature: string;
        record: ErrorRecord;
    };
    findPromotion(signature: string): Promotion | undefined;
    promote(entry: Omit<Promotion, "promotedAt">, maxRules: number): Promotion;
    markWarned(signature: string): void;
    addRecipe(input: {
        title: string;
        problem: string;
        solution: string;
        scope?: string;
        keywords?: string;
    }): RuntimeRecipe;
    flush(): void;
    private scheduleSave;
}
