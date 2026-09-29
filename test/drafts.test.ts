import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { MemoryEntry } from "../src/memory.js";

const memory = await import("../src/memory.js");

let home = "";

before(() => {
	home = mkdtempSync(join(tmpdir(), "dsh-ei-drafts-"));
	process.env.DSH_HOME = home;
});

after(() => {
	rmSync(home, { recursive: true, force: true });
});

function makeEntry(
	kind: "lesson" | "recipe",
	overrides: Partial<MemoryEntry> = {},
): MemoryEntry {
	const entry = memory.newEntry(kind, `${kind}-draft-1`);
	entry.title = "Draft title";
	if (kind === "lesson") {
		entry.mistake = "m";
		entry.prevention = "p";
	} else {
		entry.problem = "p";
		entry.solution = "s";
	}
	Object.assign(entry, overrides);
	return entry;
}

test("writeDraft/listDrafts/deleteDraft lifecycle", async () => {
	const drafts = await import("../src/drafts.js");
	const draft = drafts.writeDraft(makeEntry("lesson"), "distillation");
	assert.ok(
		existsSync(
			join(home, "error-improvement", "memory", "drafts", `${draft.id}.md`),
		),
	);

	const list = drafts.listDrafts();
	assert.equal(list.length, 1);
	assert.equal(list[0]?.entry.title, "Draft title");
	assert.equal(list[0]?.from, "distillation");

	drafts.deleteDraft(draft.id);
	assert.equal(drafts.listDrafts().length, 0);
});

test("approveDraft upserts into lessons.md as confirmed and retires the predecessor", async () => {
	const { memoryFile } = await import("../src/paths.js");
	const drafts = await import("../src/drafts.js");

	const oldEntry = memory.newEntry("lesson", "lesson-old");
	oldEntry.title = "old rule";
	oldEntry.prevention = "p";
	memory.upsertEntry(memoryFile("lessons"), "lesson", oldEntry);

	const draft = drafts.writeDraft(
		makeEntry("lesson", { supersedes: "lesson-old" }),
		"distillation",
	);
	const approved = drafts.approveDraft(draft.id);
	assert.ok(approved, "returns the approved entry");

	const entries = memory.readEntries(memoryFile("lessons"), "lesson");
	const predecessor = entries.find(
		(candidate) => candidate.id === "lesson-old",
	);
	assert.ok(predecessor);
	assert.equal(
		predecessor.enabled,
		false,
		"superseded entry disabled, not deleted",
	);
	const approvedStored = entries.find(
		(candidate) => candidate.id === draft.entry.id,
	);
	assert.ok(approvedStored);
	assert.equal(approvedStored.confirmed, true);
	assert.equal(drafts.listDrafts().length, 0);
});

test("rejectDraft records a decision and removes the draft", async () => {
	const { memoryFile } = await import("../src/paths.js");
	const drafts = await import("../src/drafts.js");
	const draft = drafts.writeDraft(makeEntry("lesson"), "distillation");
	assert.equal(drafts.rejectDraft(draft.id, "not a real rule"), true);
	const decisions = memory.readEntries(memoryFile("decisions"), "decision");
	assert.equal(decisions.length, 1);
	assert.equal(decisions[0]?.kind, "decision");
	assert.equal(drafts.listDrafts().length, 0);
});

test("settleTurn bumps hits and maturity, and flags graduatable entries", async () => {
	const { memoryFile } = await import("../src/paths.js");
	const signals = await import("../src/signals.js");

	const entry = memory.newEntry("lesson", "lesson-signal");
	entry.title = "signal rule";
	entry.prevention = "p";
	memory.upsertEntry(memoryFile("lessons"), "lesson", entry);

	const turn = signals.newTurnSignals();
	turn.presentedIds.add("lesson-signal");
	turn.successfulTools = 2;
	turn.failedTools = 1;
	const outcome = signals.settleTurn(turn, 3);
	assert.equal(outcome.updated.length, 1);

	const findSignal = () =>
		memory
			.readEntries(memoryFile("lessons"), "lesson")
			.find((candidate) => candidate.id === "lesson-signal");
	const loaded = findSignal();
	assert.ok(loaded);
	assert.equal(loaded.hits, 1);
	assert.equal(loaded.maturity, "draft");
	assert.ok(loaded.lastHitAt.length > 0);

	// Second helping turn crosses the validated threshold (>= 2).
	const again = signals.newTurnSignals();
	again.presentedIds.add("lesson-signal");
	again.successfulTools = 1;
	signals.settleTurn(again, 3);
	assert.equal(findSignal()?.maturity, "validated");

	// Third helping turn reaches the graduation threshold.
	const third = signals.newTurnSignals();
	third.presentedIds.add("lesson-signal");
	third.successfulTools = 1;
	const final = signals.settleTurn(third, 3);
	assert.equal(final.graduatable.length, 1);
	assert.equal(final.graduatable[0]?.entry.id, "lesson-signal");
});

test("settleTurn ignores turns without presented entries or with regressions", async () => {
	const { memoryFile } = await import("../src/paths.js");
	const signals = await import("../src/signals.js");
	const hitsOf = () =>
		memory
			.readEntries(memoryFile("lessons"), "lesson")
			.find((candidate) => candidate.id === "lesson-signal")?.hits ?? -1;
	const beforeHits = hitsOf();

	const idle = signals.newTurnSignals();
	assert.equal(signals.settleTurn(idle, 3).updated.length, 0);

	const regressed = signals.newTurnSignals();
	regressed.presentedIds.add("lesson-signal");
	regressed.successfulTools = 3;
	regressed.newPromotions = 1;
	assert.equal(signals.settleTurn(regressed, 3).updated.length, 0);
	assert.equal(hitsOf(), beforeHits);
});

test("graduateEntry writes SKILL.md, refuses overwrite, marks source core", async () => {
	const { memoryFile, skillsRoot } = await import("../src/paths.js");
	const graduate = await import("../src/graduate.js");

	const entry = memory.newEntry("lesson", "lesson-grad");
	entry.title = "Never blind retry";
	entry.prevention = "read errors first";
	entry.maturity = "validated";
	entry.hits = 3;
	memory.upsertEntry(memoryFile("lessons"), "lesson", entry);

	const result = graduate.graduateEntry(entry);
	assert.equal(result.ok, true);
	const skillPath = join(skillsRoot(), "never-blind-retry", "SKILL.md");
	assert.equal(result.path, skillPath);
	assert.ok(existsSync(skillPath));
	const text = readFileSync(skillPath, "utf8");
	assert.ok(text.startsWith("---"));
	assert.ok(text.includes("name: never-blind-retry"));

	const again = graduate.graduateEntry(entry);
	assert.equal(again.ok, false, "refuses to overwrite an existing skill");

	const source = memory
		.readEntries(memoryFile("lessons"), "lesson")
		.find((candidate) => candidate.id === "lesson-grad");
	assert.ok(source);
	assert.equal(source.maturity, "core");
	assert.ok(source.evidence.includes("SKILL.md"));
});

test("proposeGraduation emits a draft-shaped copy pointing at the source", async () => {
	const graduate = await import("../src/graduate.js");
	const source = memory.newEntry("lesson", "lesson-src");
	source.title = "Some rule";
	const proposal = graduate.proposeGraduation(source);
	assert.ok(proposal.id.startsWith("graduate-"));
	assert.equal(proposal.confirmed, false);
	assert.equal(proposal.attributedTo, "graduation-proposal:lesson-src");
});

test("host apply() wires all layers without throwing", async () => {
	const index = await import("../src/index.js");
	const { unwrapConfig } = await import("../src/config.js");
	const events: string[] = [];
	const ctx = {
		logger: {
			info: () => {},
			warn: () => {},
			debug: () => {},
			error: () => {},
		},
		on(event: string) {
			events.push(event);
		},
		inject(this: unknown, _deps: unknown, callback: (ctx: unknown) => void) {
			callback(this);
		},
		tools: {
			register() {
				return () => {};
			},
		},
		connection: {
			rpc: {
				handle() {
					return () => {};
				},
			},
		},
	};
	index.apply(ctx as never, unwrapConfig({}));
	assert.ok(events.includes("agent/pre-step"));
	assert.ok(events.includes("tools/post-execute"));
	assert.ok(events.includes("session/event"));
});
