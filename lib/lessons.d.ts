/** Safe rendering and relevance matching for user-confirmed error lessons. */
import { type ContentBlock, type UserMessage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
export declare const SETTINGS_NAMESPACE = "error-improvement";
export declare const PLUGIN_NAME = "dsh-error-improvement";
export interface ErrorLesson {
    id: string;
    title: string;
    mistake: string;
    prevention: string;
    scope?: string;
    keywords?: string;
    /** Only explicitly user-confirmed lessons are eligible for injection. */
    confirmed?: boolean;
    enabled?: boolean;
}
export interface CompactionSettings {
    enabled?: boolean;
    /** Fraction of context window at which compaction triggers (0.0–1.0). */
    thresholdRatio?: number;
    /** Fraction of context window retained as verbatim tail after compaction. */
    retainRatio?: number;
    /** Provider for the summarization model. Empty = use current conversation model. */
    summarizationProvider?: string;
    /** Model for the summarization. Empty = use current conversation model. */
    summarizationModel?: string;
    /** Provider to retry when the primary summarization route fails. Empty = conversation route. */
    fallbackSummarizationProvider?: string;
    /** Model to retry when the primary summarization route fails. Empty = conversation route. */
    fallbackSummarizationModel?: string;
    /** Max output tokens for the summarization call. */
    maxTokens?: number;
}
export interface ErrorImprovementSettings {
    enabled?: boolean;
    mode?: "assist" | "strict";
    maxLessons?: number;
    maxChars?: number;
    lessons?: ErrorLesson[];
    compaction?: CompactionSettings;
}
/** Built-in lessons that apply to every installation. */
export declare const builtinLessons: readonly ErrorLesson[];
export declare const defaultSettings: Readonly<Required<ErrorImprovementSettings>>;
export declare const ErrorImprovementSettingsSchema: z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
    mode: z<"assist" | "strict", "assist" | "strict">;
    maxLessons: z<number, number>;
    maxChars: z<number, number>;
    lessons: z<({
        id?: string | null | undefined;
        title?: string | null | undefined;
        mistake?: string | null | undefined;
        prevention?: string | null | undefined;
        scope?: string | null | undefined;
        keywords?: string | null | undefined;
        confirmed?: boolean | null | undefined;
        enabled?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
        id: z<string, string>;
        title: z<string, string>;
        mistake: z<string, string>;
        prevention: z<string, string>;
        scope: z<string, string>;
        keywords: z<string, string>;
        confirmed: z<boolean, boolean>;
        enabled: z<boolean, boolean>;
    }>[]>;
    compaction: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        summarizationProvider: z<string, string>;
        summarizationModel: z<string, string>;
        fallbackSummarizationProvider: z<string, string>;
        fallbackSummarizationModel: z<string, string>;
        maxTokens: z<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        summarizationProvider: z<string, string>;
        summarizationModel: z<string, string>;
        fallbackSummarizationProvider: z<string, string>;
        fallbackSummarizationModel: z<string, string>;
        maxTokens: z<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
    mode: z<"assist" | "strict", "assist" | "strict">;
    maxLessons: z<number, number>;
    maxChars: z<number, number>;
    lessons: z<({
        id?: string | null | undefined;
        title?: string | null | undefined;
        mistake?: string | null | undefined;
        prevention?: string | null | undefined;
        scope?: string | null | undefined;
        keywords?: string | null | undefined;
        confirmed?: boolean | null | undefined;
        enabled?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
        id: z<string, string>;
        title: z<string, string>;
        mistake: z<string, string>;
        prevention: z<string, string>;
        scope: z<string, string>;
        keywords: z<string, string>;
        confirmed: z<boolean, boolean>;
        enabled: z<boolean, boolean>;
    }>[]>;
    compaction: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        summarizationProvider: z<string, string>;
        summarizationModel: z<string, string>;
        fallbackSummarizationProvider: z<string, string>;
        fallbackSummarizationModel: z<string, string>;
        maxTokens: z<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        summarizationProvider: z<string, string>;
        summarizationModel: z<string, string>;
        fallbackSummarizationProvider: z<string, string>;
        fallbackSummarizationModel: z<string, string>;
        maxTokens: z<number, number>;
    }>>;
}>>;
export declare function relevanceScore(lesson: ErrorLesson, query: string): number;
export declare function selectLessons(settings: ErrorImprovementSettings, query: string): ErrorLesson[];
export declare function renderLessons(settings: ErrorImprovementSettings, query: string): string | undefined;
export declare function blocksToText(blocks: readonly ContentBlock[] | undefined): string;
export declare function directUserQuery(messages: readonly UserMessage[]): string;
export declare function isLessonMessage(message: UserMessage): boolean;
export declare function lessonMessage(settings: ErrorImprovementSettings, messages: readonly UserMessage[]): UserMessage | undefined;
