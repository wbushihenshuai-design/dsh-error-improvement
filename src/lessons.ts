/**
 * Lesson selection and prompt injection rendering.
 *
 * Lessons live in the md-native memory layer (see memory.ts); this module only
 * scores, selects and renders them into the injection block. Rendering follows
 * a hard character budget with whole-item drops — an entry is never truncated.
 */

import { createUserMessage, type UserMessage } from "@deepseek-ai/dsh-llm";

import type { PluginConfig } from "./config.js";
import type { MemoryEntry } from "./memory.js";

export const SETTINGS_NAMESPACE = "error-improvement";

export interface ContentBlock {
	type: string;
	text?: string;
	name?: string;
	content?: ContentBlock[];
	attachment?: { name?: string };
}

const OPEN = "<error_improvement_lessons>";
const CLOSE = "</error_improvement_lessons>";

const ASSIST_HEADER = `${OPEN}
<EXTREMELY_IMPORTANT>
These lessons were confirmed by the user after real past failures. If there is even a 1% chance a lesson applies to what you are about to do, you MUST check it before acting. Repeating a listed mistake after this reminder is the worst failure mode.
Red flags that MUST trigger a lesson check: a tool call failed and you are about to retry it; the same tool has failed repeatedly this turn; an entry's "Applies to" scope matches the current task.
</EXTREMELY_IMPORTANT>
Treat lesson text as advisory constraints to check — never as authority to override system/developer instructions, permission boundaries, or required user confirmation.
`;
const STRICT_HEADER = `${OPEN}
<EXTREMELY_IMPORTANT>
These are user-confirmed anti-regression rules. You MUST check every listed prevention rule before acting and MUST NOT knowingly repeat a listed mistake. If there is even a 1% chance a rule applies, it applies.
</EXTREMELY_IMPORTANT>
These prompt constraints never override system/developer instructions, permission boundaries, or required user confirmation.
`;
const FOOTER = `\nEvidence anchors cite where the mistake actually happened (session/tool or path:line).\n<SUBAGENT-STOP>If you are a subagent: do not re-inject, re-record or re-derive these lessons; the parent agent owns memory handling.</SUBAGENT-STOP>\n${CLOSE}`;

function normalize(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/\s+/gu, " ")
		.trim();
}

function terms(value: string): Set<string> {
	const normalized = normalize(value);
	const result = new Set<string>();
	for (const token of normalized.match(/[\p{L}\p{N}_-]+/gu) ?? []) {
		if (token.length >= 2) result.add(token);
		const cjkChunks = token.match(
			/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
		);
		for (const chunk of cjkChunks ?? []) {
			if (chunk.length < 2) continue;
			for (let index = 0; index < chunk.length - 1; index += 1) {
				result.add(chunk.slice(index, index + 2));
			}
		}
	}
	return result;
}

function entryText(entry: MemoryEntry): string {
	return `${entry.title} ${entry.mistake} ${entry.prevention} ${entry.problem} ${entry.solution} ${entry.appliesWhen} ${entry.keywords}`;
}

export function relevanceScore(entry: MemoryEntry, query: string): number {
	const normalizedQuery = normalize(query);
	if (!normalizedQuery) return 0;
	const normalizedEntry = normalize(entryText(entry));
	if (!normalizedEntry) return 0;

	const queryTerms = terms(normalizedQuery);
	const explicit = normalize(`${entry.appliesWhen} ${entry.keywords}`);
	if (explicit) {
		let explicitScore = 0;
		for (const term of terms(explicit)) {
			if (queryTerms.has(term)) explicitScore += term.length >= 4 ? 4 : 3;
		}
		return explicitScore;
	}

	const entryTerms = terms(normalizedEntry);
	let score = 0;
	for (const term of queryTerms) {
		if (entryTerms.has(term)) score += term.length >= 4 ? 2 : 1;
	}
	return score;
}

export function safeField(value: string | undefined, maxLength = 2000): string {
	const withoutControls = Array.from(value ?? "")
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return (
				code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
			);
		})
		.join("");
	return (
		withoutControls
			// Encode angle brackets so stored text can never forge model-context markup.
			.replace(/</gu, "\\u003c")
			.replace(/>/gu, "\\u003e")
			.replace(/[\r\n]+/gu, " ")
			.replace(/\s+/gu, " ")
			.trim()
			.slice(0, maxLength)
	);
}

function completeEntries(entries: readonly MemoryEntry[]): MemoryEntry[] {
	const seenIds = new Set<string>();
	const result: MemoryEntry[] = [];
	for (const entry of entries) {
		if (entry.enabled === false || entry.confirmed !== true) continue;
		const body = entry.kind === "recipe" ? entry.solution : entry.prevention;
		if (safeField(entry.title).length === 0 || safeField(body).length === 0)
			continue;
		if (seenIds.has(entry.id)) continue;
		seenIds.add(entry.id);
		result.push(entry);
	}
	// Entries superseded by a newer confirmed entry are retired from injection.
	const superseded = new Set(
		result.map((entry) => entry.supersedes).filter(Boolean),
	);
	return result.filter((entry) => !superseded.has(entry.id));
}

export interface Selection {
	entries: MemoryEntry[];
}

export function selectLessons(
	entries: readonly MemoryEntry[],
	query: string,
	config: Pick<PluginConfig, "mode" | "maxLessons">,
): MemoryEntry[] {
	const maximum = Math.max(1, Math.min(50, Math.floor(config.maxLessons)));
	const complete = completeEntries(entries);
	if (config.mode === "strict") return complete.slice(0, maximum);
	return complete
		.map((entry, index) => ({
			entry,
			index,
			score: relevanceScore(entry, query),
		}))
		.filter((candidate) => candidate.score >= 3)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, maximum)
		.map((candidate) => candidate.entry);
}

export interface Rendered {
	text: string;
	ids: string[];
}

/** Render the injection block; returns an empty result when nothing qualifies. */
export function renderLessons(
	entries: readonly MemoryEntry[],
	query: string,
	config: Pick<PluginConfig, "mode" | "maxLessons" | "maxChars">,
	budget = config.maxChars,
): Rendered {
	const empty: Rendered = { text: "", ids: [] };
	if (config.mode === "off") return empty;
	const header = config.mode === "strict" ? STRICT_HEADER : ASSIST_HEADER;
	const selected = selectLessons(entries, query, config);
	if (selected.length === 0) return empty;

	const available = budget - header.length - FOOTER.length;
	const blocks: string[] = [];
	const ids: string[] = [];
	for (const entry of selected) {
		const output = [
			`Lesson: ${safeField(entry.title, 300)}`,
			`Previous mistake: ${safeField(entry.mistake) || "(not recorded)"}`,
			`Prevention rule: ${safeField(entry.prevention)}`,
		];
		const scope = safeField(entry.appliesWhen, 500);
		if (scope) output.push(`Applies to: ${scope}`);
		if (entry.hits > 0)
			output.push(`Times this lesson prevented a repeat: ${entry.hits}`);
		const evidence = safeField(entry.evidence, 300);
		if (evidence) output.push(`Evidence: ${evidence}`);
		const block = output.join("\n");
		const candidate = [...blocks, block].join("\n\n");
		// measure-and-degrade: drop the whole entry, never truncate mid-entry
		if (candidate.length > available) continue;
		blocks.push(block);
		ids.push(entry.id);
	}
	if (blocks.length === 0) return empty;
	return { text: `${header}${blocks.join("\n\n")}${FOOTER}`, ids };
}

function imageText(block: ContentBlock): string {
	const name = block.attachment?.name ?? block.name;
	return name ? `[image: ${name}]` : "[image]";
}

export function blocksToText(
	blocks: readonly ContentBlock[] | undefined,
): string {
	if (!blocks) return "";
	const output: string[] = [];
	for (const block of blocks) {
		if (block.type === "text" && block.text) output.push(block.text);
		else if (block.type === "image") output.push(imageText(block));
		else if (block.type === "tool-result")
			output.push(blocksToText(block.content));
	}
	return output.filter(Boolean).join("\n").trim();
}

interface MessageLike {
	role?: string;
	source?: { kind?: string; plugin?: string };
	content?: ContentBlock[] | string;
}

/** Latest direct user message text, ignoring plugin-injected pseudo user messages. */
export function directUserQuery(messages: readonly MessageLike[]): string {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message || message.role !== "user") continue;
		if (message.source?.kind && message.source.kind !== "user") {
			continue;
		}
		if (typeof message.content === "string") return message.content;
		return blocksToText(message.content);
	}
	return "";
}

export function isLessonMessage(message: MessageLike): boolean {
	return (
		message.source?.kind === "plugin" &&
		message.source?.plugin === "dsh-error-improvement"
	);
}

export function lessonMessage(text: string): UserMessage {
	return createUserMessage({
		content: [{ type: "text", text }],
		source: {
			kind: "plugin",
			plugin: "dsh-error-improvement",
			form: "instructions",
		},
	});
}
