/**
 * Lesson selection and prompt injection rendering.
 *
 * Lessons live in the md-native memory layer (see memory.ts); this module only
 * scores, selects and renders them into the injection block. Rendering follows
 * a hard character budget with whole-item drops — an entry is never truncated.
 */
import { type UserMessage } from "@deepseek-ai/dsh-llm";
import type { PluginConfig } from "./config.js";
import type { MemoryEntry } from "./memory.js";
export declare const SETTINGS_NAMESPACE = "error-improvement";
export interface ContentBlock {
    type: string;
    text?: string;
    name?: string;
    content?: ContentBlock[];
    attachment?: {
        name?: string;
    };
}
export declare function relevanceScore(entry: MemoryEntry, query: string): number;
export declare function safeField(value: string | undefined, maxLength?: number): string;
export interface Selection {
    entries: MemoryEntry[];
}
export declare function selectLessons(entries: readonly MemoryEntry[], query: string, config: Pick<PluginConfig, "mode" | "maxLessons">): MemoryEntry[];
export interface Rendered {
    text: string;
    ids: string[];
}
/** Render the injection block; returns an empty result when nothing qualifies. */
export declare function renderLessons(entries: readonly MemoryEntry[], query: string, config: Pick<PluginConfig, "mode" | "maxLessons" | "maxChars">, budget?: number): Rendered;
export declare function blocksToText(blocks: readonly ContentBlock[] | undefined): string;
interface MessageLike {
    role?: string;
    source?: {
        kind?: string;
        plugin?: string;
    };
    content?: ContentBlock[] | string;
}
/** Latest direct user message text, ignoring plugin-injected pseudo user messages. */
export declare function directUserQuery(messages: readonly MessageLike[]): string;
export declare function isLessonMessage(message: MessageLike): boolean;
export declare function lessonMessage(text: string): UserMessage;
export {};
