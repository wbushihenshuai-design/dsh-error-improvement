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

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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

export function newEntry(
	kind: EntryKind,
	id: string,
	now = new Date(),
): MemoryEntry {
	const iso = now.toISOString();
	return {
		id,
		kind,
		title: "",
		appliesWhen: "",
		mistake: "",
		prevention: "",
		problem: "",
		solution: "",
		keywords: "",
		confirmed: false,
		enabled: true,
		maturity: "draft",
		hits: 0,
		createdAt: iso,
		updatedAt: iso,
		lastHitAt: "",
		evidence: "",
		attributedTo: "",
		supersedes: "",
	};
}

const HEADER_RE = /^##\s+(\S+)\s*$/u;
const FIELD_RE = /^- ([a-z_]+): ?(.*)$/u;

function escapeField(value: string): string {
	return value.replace(/\\/gu, "\\\\").replace(/\r?\n/gu, "\\n");
}

function unescapeField(value: string): string {
	return value.replace(/\\n/gu, "\n").replace(/\\\\/gu, "\\");
}

/** Ordered field list; fields at their zero value are omitted on render. */
const FIELDS: [string, (entry: MemoryEntry) => string][] = [
	["title", (e) => e.title],
	["kind", (e) => (e.kind === "lesson" ? "" : e.kind)],
	["applies_when", (e) => e.appliesWhen],
	["mistake", (e) => e.mistake],
	["prevention", (e) => e.prevention],
	["problem", (e) => e.problem],
	["solution", (e) => e.solution],
	["keywords", (e) => e.keywords],
	["confirmed", (e) => (e.confirmed ? "true" : "")],
	["enabled", (e) => (e.enabled ? "" : "false")],
	["maturity", (e) => (e.maturity === "draft" ? "" : e.maturity)],
	["hits", (e) => (e.hits > 0 ? String(e.hits) : "")],
	["created", (e) => e.createdAt],
	["updated", (e) => e.updatedAt],
	["last_hit", (e) => e.lastHitAt],
	["evidence", (e) => e.evidence],
	["attributed_to", (e) => e.attributedTo],
	["supersedes", (e) => e.supersedes],
];

const SETTERS: Record<string, (entry: MemoryEntry, value: string) => void> = {
	title: (e, v) => {
		e.title = v;
	},
	kind: (e, v) => {
		if (v === "recipe" || v === "decision" || v === "lesson") e.kind = v;
	},
	applies_when: (e, v) => {
		e.appliesWhen = v;
	},
	mistake: (e, v) => {
		e.mistake = v;
	},
	prevention: (e, v) => {
		e.prevention = v;
	},
	problem: (e, v) => {
		e.problem = v;
	},
	solution: (e, v) => {
		e.solution = v;
	},
	keywords: (e, v) => {
		e.keywords = v;
	},
	confirmed: (e, v) => {
		e.confirmed = v === "true";
	},
	enabled: (e, v) => {
		e.enabled = v !== "false";
	},
	maturity: (e, v) => {
		if (v === "draft" || v === "validated" || v === "core") e.maturity = v;
	},
	hits: (e, v) => {
		const n = Number(v);
		if (Number.isFinite(n) && n >= 0) e.hits = Math.floor(n);
	},
	created: (e, v) => {
		e.createdAt = v;
	},
	updated: (e, v) => {
		e.updatedAt = v;
	},
	last_hit: (e, v) => {
		e.lastHitAt = v;
	},
	evidence: (e, v) => {
		e.evidence = v;
	},
	attributed_to: (e, v) => {
		e.attributedTo = v;
	},
	supersedes: (e, v) => {
		e.supersedes = v;
	},
};

const KIND_TO_FILE_KIND: Record<EntryKind, string> = {
	lesson: "lessons",
	recipe: "recipes",
	decision: "decisions",
};

export function parseMemoryFile(
	text: string,
	fallbackKind: EntryKind,
): MemoryEntry[] {
	const entries: MemoryEntry[] = [];
	let current: MemoryEntry | undefined;
	for (const line of text.split("\n")) {
		const header = HEADER_RE.exec(line.trim());
		if (header) {
			const id = header[1];
			if (!id) continue;
			current = newEntry(fallbackKind, id);
			entries.push(current);
			continue;
		}
		if (!current) continue;
		const field = FIELD_RE.exec(line.trim());
		if (!field) continue;
		const fieldName = field[1];
		if (!fieldName) continue;
		const setter = SETTERS[fieldName];
		if (setter) setter(current, unescapeField(field[2] ?? ""));
	}
	return entries.filter((entry) => entry.title.trim().length > 0);
}

export function renderMemoryFile(
	kind: EntryKind,
	entries: readonly MemoryEntry[],
): string {
	const lines = [
		`# dsh-error-improvement memory: ${KIND_TO_FILE_KIND[kind]}`,
		"<!-- format: v1 -->",
		"",
	];
	for (const entry of entries) {
		lines.push(`## ${entry.id}`);
		for (const [key, read] of FIELDS) {
			const value = read(entry);
			if (value) lines.push(`- ${String(key)}: ${escapeField(value)}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

/** Read a memory file; a missing or unreadable file yields an empty list. */
export function readEntries(path: string, kind: EntryKind): MemoryEntry[] {
	try {
		return parseMemoryFile(readFileSync(path, "utf8"), kind);
	} catch {
		return [];
	}
}

export function writeEntriesAtomic(
	path: string,
	kind: EntryKind,
	entries: readonly MemoryEntry[],
): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}`;
	writeFileSync(tmp, renderMemoryFile(kind, entries), "utf8");
	renameSync(tmp, path);
}

/** Insert or replace (by id) one entry; returns the full updated list. */
export function upsertEntry(
	path: string,
	kind: EntryKind,
	entry: MemoryEntry,
): MemoryEntry[] {
	const entries = readEntries(path, kind);
	const index = entries.findIndex((candidate) => candidate.id === entry.id);
	if (index >= 0) entries[index] = entry;
	else entries.push(entry);
	writeEntriesAtomic(path, kind, entries);
	return entries;
}

/** Read-modify-write every entry through `mutate`; dropped entries return null. */
export function updateEntries(
	path: string,
	kind: EntryKind,
	mutate: (entry: MemoryEntry) => MemoryEntry | null,
): MemoryEntry[] {
	const updated: MemoryEntry[] = [];
	for (const entry of readEntries(path, kind)) {
		const next = mutate(entry);
		if (next) updated.push(next);
	}
	writeEntriesAtomic(path, kind, updated);
	return updated;
}

export function newEntryId(prefix: string, now = new Date()): string {
	const stamp = now
		.toISOString()
		.replace(/[-:T.Z]/gu, "")
		.slice(0, 14);
	const rand = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${stamp}-${rand}`;
}
