/**
 * Md-native memory store.
 *
 * Each memory file (`lessons.md`, `recipes.md`, `decisions.md`) is the single
 * source of truth and is meant to be human-editable and git-diffable:
 *
 *   # dsh-error-improvement memory: lessons
 *   <!-- format: v1 -->
 *
 *   ## lesson-20260929-abcdef
 *   - title: ...
 *   - mistake: ...
 *   - prevention: ...
 *
 * Values are single-line (`\n` escaped). Parsing is tolerant: unknown keys and
 * malformed lines are skipped so hand edits can never wedge the plugin.
 */
export type EntryKind = "lesson" | "recipe" | "decision";
export type Maturity = "draft" | "validated" | "core";
export interface MemoryEntry {
    id: string;
    kind: EntryKind;
    title: string;
    /** When this entry applies (tool names, task shapes, paths…). */
    appliesWhen: string;
    /** lesson: what went wrong. */
    mistake: string;
    /** lesson: the rule that prevents the mistake. */
    prevention: string;
    /** recipe: the problem that was solved. */
    problem: string;
    /** recipe: the proven solution. */
    solution: string;
    keywords: string;
    confirmed: boolean;
    enabled: boolean;
    maturity: Maturity;
    hits: number;
    createdAt: string;
    updatedAt: string;
    lastHitAt: string;
    /** Evidence anchor, e.g. session id + tool name, or `path:line`. */
    evidence: string;
    attributedTo: string;
    /** Id of the entry this one replaces. */
    supersedes: string;
}
export declare function newEntry(kind: EntryKind, id: string, now?: Date): MemoryEntry;
export declare function parseMemoryFile(text: string, fallbackKind: EntryKind): MemoryEntry[];
export declare function renderMemoryFile(kind: EntryKind, entries: readonly MemoryEntry[]): string;
/** Read a memory file; a missing or unreadable file yields an empty list. */
export declare function readEntries(path: string, kind: EntryKind): MemoryEntry[];
export declare function writeEntriesAtomic(path: string, kind: EntryKind, entries: readonly MemoryEntry[]): void;
/** Insert or replace (by id) one entry; returns the full updated list. */
export declare function upsertEntry(path: string, kind: EntryKind, entry: MemoryEntry): MemoryEntry[];
/** Read-modify-write every entry through `mutate`; dropped entries return null. */
export declare function updateEntries(path: string, kind: EntryKind, mutate: (entry: MemoryEntry) => MemoryEntry | null): MemoryEntry[];
export declare function newEntryId(prefix: string, now?: Date): string;
