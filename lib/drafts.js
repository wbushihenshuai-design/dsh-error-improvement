/**
 * Draft queue: LLM-distilled (or agent-recorded) lesson/recipe proposals that
 * await explicit user confirmation. A draft is a single-entry memory-format
 * file under memory/drafts/<id>.md plus a small metadata comment.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join } from "node:path";
import { newEntry, parseMemoryFile, readEntries, renderMemoryFile, updateEntries, upsertEntry, } from "./memory.js";
import { draftsRoot, memoryFile } from "./paths.js";
const META_RE = /^<!--\s*draft-kind:\s*(\w+);\s*from:\s*([^;]+);\s*created:\s*([^\s]+)\s*-->/u;
function draftPath(id) {
    return join(draftsRoot(), `${id}.md`);
}
export function writeDraft(entry, from) {
    mkdirSync(draftsRoot(), { recursive: true });
    const draft = {
        id: entry.id,
        kind: entry.kind,
        from,
        createdAt: entry.createdAt,
        entry,
    };
    const body = renderMemoryFile(entry.kind, [entry]);
    const meta = `<!-- draft-kind: ${entry.kind}; from: ${from}; created: ${entry.createdAt} -->\n`;
    writeFileSync(draftPath(entry.id), meta + body, "utf8");
    return draft;
}
export function readDraft(id) {
    let text;
    try {
        text = readFileSync(draftPath(id), "utf8");
    }
    catch {
        return undefined;
    }
    const meta = META_RE.exec(text.split("\n", 1)[0] ?? "");
    const kind = (meta?.[1] === "recipe" ? "recipe" : "lesson");
    const entry = parseMemoryFile(text, kind)[0];
    if (!entry)
        return undefined;
    return {
        id: entry.id,
        kind,
        from: meta?.[2]?.trim() ?? "unknown",
        createdAt: meta?.[3]?.trim() ?? entry.createdAt,
        entry,
    };
}
export function listDrafts() {
    let names;
    try {
        names = readdirSync(draftsRoot());
    }
    catch {
        return [];
    }
    const drafts = [];
    for (const name of names) {
        if (!name.endsWith(".md"))
            continue;
        const draft = readDraft(name.slice(0, -3));
        if (draft)
            drafts.push(draft);
    }
    return drafts.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
export function deleteDraft(id) {
    try {
        rmSync(draftPath(id), { force: true });
    }
    catch {
        // fail-open
    }
}
/** Patch editable fields of a pending draft. */
export function updateDraft(id, patch) {
    const draft = readDraft(id);
    if (!draft)
        return undefined;
    Object.assign(draft.entry, patch);
    draft.entry.updatedAt = new Date().toISOString();
    writeDraft(draft.entry, draft.from);
    return readDraft(id);
}
function targetFile(kind) {
    return kind === "recipe" ? memoryFile("recipes") : memoryFile("lessons");
}
/**
 * Approve a draft: upsert it (confirmed) into its memory file, retire any
 * superseded predecessor, then remove the draft. Returns the stored entry.
 */
export function approveDraft(id) {
    const draft = readDraft(id);
    if (!draft)
        return undefined;
    const entry = draft.entry;
    entry.confirmed = true;
    entry.enabled = true;
    entry.updatedAt = new Date().toISOString();
    const file = targetFile(draft.kind);
    upsertEntry(file, draft.kind, entry);
    if (entry.supersedes) {
        updateEntries(file, draft.kind, (candidate) => {
            if (candidate.id !== entry.supersedes)
                return candidate;
            candidate.enabled = false;
            candidate.updatedAt = entry.updatedAt;
            return candidate;
        });
    }
    deleteDraft(id);
    return entry;
}
/** Reject a draft: log the decision (so distillation can learn) and drop it. */
export function rejectDraft(id, reason = "") {
    const draft = readDraft(id);
    if (!draft)
        return false;
    const decision = newEntry("decision", `decision-reject-${id}`);
    decision.title = `Rejected draft: ${draft.entry.title}`;
    decision.kind = "decision";
    decision.prevention = "";
    decision.problem = "";
    decision.mistake = "";
    decision.solution = "";
    decision.keywords = draft.entry.keywords;
    decision.confirmed = true;
    decision.attributedTo = "user";
    decision.evidence = reason.slice(0, 300);
    upsertEntry(memoryFile("decisions"), "decision", decision);
    deleteDraft(id);
    return true;
}
export function draftStats() {
    return { pending: listDrafts().length };
}
/** All current memory entries (lessons + recipes), used by the distiller index. */
export function memoryIndex() {
    return {
        lessons: readEntries(memoryFile("lessons"), "lesson"),
        recipes: readEntries(memoryFile("recipes"), "recipe"),
    };
}
