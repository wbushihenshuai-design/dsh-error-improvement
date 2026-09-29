/**
 * Draft queue: LLM-distilled (or agent-recorded) lesson/recipe proposals that
 * await explicit user confirmation. A draft is a single-entry memory-format
 * file under memory/drafts/<id>.md plus a small metadata comment.
 */
import { type EntryKind, type MemoryEntry } from "./memory.js";
export interface Draft {
    id: string;
    kind: EntryKind;
    from: string;
    createdAt: string;
    entry: MemoryEntry;
}
export declare function writeDraft(entry: MemoryEntry, from: string): Draft;
export declare function readDraft(id: string): Draft | undefined;
export declare function listDrafts(): Draft[];
export declare function deleteDraft(id: string): void;
/** Patch editable fields of a pending draft. */
export declare function updateDraft(id: string, patch: Partial<Pick<MemoryEntry, "title" | "appliesWhen" | "mistake" | "prevention" | "problem" | "solution" | "keywords">>): Draft | undefined;
/**
 * Approve a draft: upsert it (confirmed) into its memory file, retire any
 * superseded predecessor, then remove the draft. Returns the stored entry.
 */
export declare function approveDraft(id: string): MemoryEntry | undefined;
/** Reject a draft: log the decision (so distillation can learn) and drop it. */
export declare function rejectDraft(id: string, reason?: string): boolean;
export declare function draftStats(): {
    pending: number;
};
/** All current memory entries (lessons + recipes), used by the distiller index. */
export declare function memoryIndex(): {
    lessons: MemoryEntry[];
    recipes: MemoryEntry[];
};
