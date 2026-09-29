/**
 * LLM distillation: turn queued capture candidates into reviewable drafts.
 *
 * Two stages (cognee-style): a Curator call decides per candidate
 * new/duplicate/reject against the existing memory index; a Writer call then
 * drafts entries for the survivors. Everything lands in memory/drafts/ and
 * nothing reaches lessons.md/recipes.md without explicit user confirmation.
 *
 * Red lines honored here: recursion guard (module flag), FLUSH_OK sentinel,
 * whole-candidate budget drops, fail-open on any LLM/parse error.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import type { Context } from "@deepseek-ai/cordis";
import { BlockAssembler } from "@deepseek-ai/dsh-llm";

import type { Candidate } from "./capture.js";
import type { PluginConfig } from "./config.js";
import { writeDraft } from "./drafts.js";
import {
	type EntryKind,
	type MemoryEntry,
	newEntry,
	newEntryId,
} from "./memory.js";
import { candidatesFile } from "./paths.js";
import type { ImprovementStore } from "./store.js";

export const FLUSH_OK = "FLUSH_OK";

/** Recursion guard: a distillation-triggered LLM call never re-triggers one. */
let inFlight = false;

interface LlmTarget {
	provider: string;
	model: string;
}

interface SessionLike {
	requestHeader?: () =>
		| { config?: { provider?: string; model?: string } }
		| undefined;
}

interface CuratorAction {
	candidate?: number;
	verdict?: string;
	target_id?: string;
}

interface WriterEntry {
	kind?: string;
	title?: string;
	applies_when?: string;
	mistake?: string;
	prevention?: string;
	problem?: string;
	solution?: string;
	keywords?: string;
	supersedes?: string;
}

async function callLlm(
	ctx: Context,
	target: LlmTarget,
	system: string,
	user: string,
	signal?: AbortSignal,
): Promise<string> {
	const llm = (
		ctx as unknown as {
			llm?: { stream(options: unknown): AsyncIterable<unknown> };
		}
	).llm;
	if (!llm) throw new Error("llm service unavailable");
	const assembler = new BlockAssembler();
	const options: Record<string, unknown> = {
		provider: target.provider,
		model: target.model,
		messages: [
			{ role: "system", content: [{ type: "text", text: system }] },
			{ role: "user", content: [{ type: "text", text: user }] },
		],
		maxTokens: 4096,
		purpose: "error-improvement-distill",
		...(signal ? { signal } : {}),
	};
	for await (const chunk of llm.stream(options)) {
		(assembler as { push(c: unknown): void }).push(chunk);
	}
	await (assembler as unknown as { finish: Promise<unknown> }).finish;
	const blocks = (
		assembler as unknown as { blocks(): { type?: string; text?: string }[] }
	).blocks();
	return blocks
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

/** Extract the first JSON object/array from model output, tolerating fences. */
function parseJson<T>(text: string): T | undefined {
	const fence = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
	const raw = fence?.[1] ?? text;
	const start = raw.search(/[[{]/u);
	const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
	if (start < 0 || end <= start) return undefined;
	try {
		return JSON.parse(raw.slice(start, end + 1)) as T;
	} catch {
		return undefined;
	}
}

const CURATOR_SYSTEM = `You are the memory curator of a coding agent. Given capture candidates (user corrections, repeated tool errors) and the agent's existing memory index, decide for EACH candidate one verdict:
- "new": durable, reusable knowledge not covered by the index
- "duplicate": covered by an existing entry (give its target_id); choose this unless the candidate adds materially new information
- "reject": not durable knowledge (one-off context, unsupported claim, secrets, already obvious behavior)
Rules: prefer updating over creating; only durable lessons/recipes survive; absolute dates must be anchored in text, not implied.
Reply with JSON only: {"actions":[{"candidate":<1-based index>,"verdict":"new|duplicate|reject","target_id":"<id or empty>","reason":"<short>"}]}`;

const WRITER_SYSTEM = `You are the memory writer of a coding agent. Turn the approved capture candidates into memory entries.
Each entry is one of:
- lesson: {"kind":"lesson","title","applies_when","mistake","prevention","keywords"} — prevention is a concrete checkable rule.
- recipe: {"kind":"recipe","title","applies_when","problem","solution","keywords"} — solution is the proven approach, concrete enough to reuse.
Rules: title ≤ 60 chars; every text field ≤ 800 chars, single paragraph, no markup fences; keywords = 3-8 lowercase terms; when an entry supersedes an existing one, set "supersedes" to that id; write in the language of the source candidates.
Reply with JSON only: {"entries":[ ... ]}`;

function indexSummary(entries: readonly MemoryEntry[]): string {
	return entries
		.filter((entry) => entry.enabled !== false)
		.map(
			(entry) =>
				`${entry.id} | ${entry.title} | applies: ${entry.appliesWhen} | kw: ${entry.keywords}`,
		)
		.join("\n")
		.slice(0, 4000);
}

function toDraftEntry(
	raw: WriterEntry,
	evidence: string,
): MemoryEntry | undefined {
	const kind: EntryKind = raw.kind === "recipe" ? "recipe" : "lesson";
	const title = (raw.title ?? "").trim();
	const body =
		(kind === "recipe" ? raw.solution : raw.prevention)?.trim() ?? "";
	if (!title || !body) return undefined;
	const entry = newEntry(kind, newEntryId(kind));
	entry.title = title.slice(0, 200);
	entry.appliesWhen = (raw.applies_when ?? "").slice(0, 500);
	entry.mistake = (raw.mistake ?? "").slice(0, 1000);
	entry.prevention = (raw.prevention ?? "").slice(0, 1000);
	entry.problem = (raw.problem ?? "").slice(0, 1000);
	entry.solution = (raw.solution ?? "").slice(0, 4000);
	entry.keywords = (raw.keywords ?? "").slice(0, 500);
	entry.evidence = evidence.slice(0, 300);
	entry.attributedTo = "distill:llm";
	const supersedes = (raw.supersedes ?? "").trim();
	if (supersedes) entry.supersedes = supersedes;
	return entry;
}

export interface DistillOutcome {
	ran: boolean;
	drafts: number;
	reason?: string;
}

/** Load candidates after the stored watermark, honoring the char budget. */
function loadQueue(
	watermark: number,
	budgetChars: number,
): { candidates: Candidate[]; nextWatermark: number; total: number } {
	const file = candidatesFile();
	let size = 0;
	try {
		size = statSync(file).size;
	} catch {
		return { candidates: [], nextWatermark: 0, total: 0 };
	}
	const offset = Math.min(Math.max(0, watermark), size);
	if (offset >= size)
		return { candidates: [], nextWatermark: offset, total: 0 };
	const raw = readFileSync(file, "utf8").slice(offset);
	const candidates: Candidate[] = [];
	let used = 0;
	let consumed = 0;
	for (const line of raw.split("\n")) {
		if (!line.trim()) {
			consumed += 1;
			continue;
		}
		consumed += line.length + 1;
		try {
			const candidate = JSON.parse(line) as Candidate;
			const cost =
				(candidate.text?.length ?? 0) + (candidate.detail?.length ?? 0) + 64;
			if (used + cost > budgetChars && candidates.length > 0) break;
			used += cost;
			candidates.push(candidate);
		} catch {
			// skip malformed line
		}
	}
	return {
		candidates,
		nextWatermark: offset + consumed,
		total: candidates.length,
	};
}

/** Compact candidates.jsonl by dropping the consumed prefix. */
function compactQueue(nextWatermark: number): void {
	const file = candidatesFile();
	try {
		const raw = readFileSync(file, "utf8");
		writeFileSync(file, raw.slice(Math.min(nextWatermark, raw.length)), "utf8");
	} catch {
		// fail-open
	}
}

export function resolveTarget(
	config: PluginConfig,
	session?: SessionLike,
): LlmTarget | undefined {
	if (config.capture.provider && config.capture.model) {
		return { provider: config.capture.provider, model: config.capture.model };
	}
	const routed = session?.requestHeader?.()?.config;
	if (routed?.provider && routed?.model) {
		return { provider: routed.provider, model: routed.model };
	}
	return undefined;
}

export async function maybeDistill(
	ctx: Context,
	getConfig: () => PluginConfig,
	store: ImprovementStore,
	session?: SessionLike,
	signal?: AbortSignal,
): Promise<DistillOutcome> {
	const config = getConfig();
	if (
		!config.enabled ||
		!config.capture.enabled ||
		!config.capture.distillEnabled
	) {
		return { ran: false, drafts: 0, reason: "disabled" };
	}
	if (inFlight) return { ran: false, drafts: 0, reason: "in-flight" };
	const now = Date.now();
	if (now - store.data.distill.lastRunAt < config.capture.minIntervalMs) {
		return { ran: false, drafts: 0, reason: "interval" };
	}
	const queue = loadQueue(
		store.data.distill.watermark,
		config.capture.maxCandidateChars,
	);
	if (queue.candidates.length < config.capture.minQueueSize) {
		return { ran: false, drafts: 0, reason: "queue-too-small" };
	}
	const target = resolveTarget(config, session);
	if (!target) return { ran: false, drafts: 0, reason: "no-llm-target" };

	inFlight = true;
	try {
		const { memoryIndex } = await import("./drafts.js");
		const index = memoryIndex();
		const candidateLines = queue.candidates
			.map(
				(candidate, position) =>
					`#${position + 1} [${candidate.kind}] (${candidate.cwd || "unknown-cwd"}) ${candidate.text}${candidate.detail ? `\n    ${candidate.detail}` : ""}`,
			)
			.join("\n");
		const curated = await callLlm(
			ctx,
			target,
			CURATOR_SYSTEM,
			`Existing memory index:\n${indexSummary([...index.lessons, ...index.recipes]) || "(empty)"}\n\nCandidates:\n${candidateLines}`,
			signal,
		);
		const actions =
			parseJson<{ actions?: CuratorAction[] }>(curated)?.actions ?? [];
		const fresh: { position: number; candidate: Candidate }[] = [];
		const supersedesByPosition = new Map<number, string>();
		for (const action of actions) {
			const position = (action.candidate ?? 0) - 1;
			const candidate = queue.candidates[position];
			if (!candidate) continue;
			if (action.verdict === "new") {
				fresh.push({ position, candidate });
			} else if (action.verdict === "duplicate" && action.target_id) {
				// duplicates with a concrete target may still refine an existing entry
				fresh.push({ position, candidate });
				supersedesByPosition.set(position, action.target_id);
			}
		}

		let drafts = 0;
		if (fresh.length > 0) {
			const written = await callLlm(
				ctx,
				target,
				WRITER_SYSTEM,
				fresh
					.map(
						({ candidate, position }) =>
							`[${candidate.kind}] ${candidate.text}${candidate.detail ? `\n${candidate.detail}` : ""}${supersedesByPosition.has(position) ? `\n(may supersede entry id: ${supersedesByPosition.get(position)})` : ""}`,
					)
					.join("\n\n"),
				signal,
			);
			const entries =
				parseJson<{ entries?: WriterEntry[] }>(written)?.entries ?? [];
			for (const raw of entries) {
				const entry = toDraftEntry(raw, queue.candidates[0]?.cwd ?? "");
				if (!entry) continue;
				writeDraft(entry, "distillation");
				drafts += 1;
			}
		}

		store.data.distill.watermark = queue.nextWatermark;
		store.data.distill.lastRunAt = now;
		store.scheduleSave();
		compactQueue(queue.nextWatermark);
		ctx.logger.info(
			`dsh-error-improvement: ${FLUSH_OK} distilled ${queue.candidates.length} candidate(s) into ${drafts} draft(s)`,
		);
		return { ran: true, drafts };
	} catch (error) {
		ctx.logger.warn(
			`dsh-error-improvement: distillation failed open: ${String(error)}`,
		);
		store.data.distill.lastRunAt = now;
		store.scheduleSave();
		return { ran: true, drafts: 0, reason: String(error) };
	} finally {
		inFlight = false;
	}
}
