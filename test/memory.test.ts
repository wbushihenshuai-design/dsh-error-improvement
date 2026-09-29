import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let home = "";

before(() => {
	home = mkdtempSync(join(tmpdir(), "dsh-ei-memory-"));
	process.env.DSH_HOME = home;
});

after(() => {
	rmSync(home, { recursive: true, force: true });
});

test("entry render/parse roundtrip preserves fields", async () => {
	const { newEntry, parseMemoryFile, renderMemoryFile } = await import(
		"../src/memory.js"
	);
	const entry = newEntry("lesson", "lesson-test-1");
	entry.title = "Do not retry blindly";
	entry.appliesWhen = "tool errors";
	entry.mistake = "retried the same failing call\nwith identical args";
	entry.prevention = "read the error first";
	entry.keywords = "retry, loop";
	entry.maturity = "validated";
	entry.hits = 3;
	entry.evidence = "session:abc";

	const text = renderMemoryFile("lesson", [entry]);
	const parsed = parseMemoryFile(text, "lesson");
	assert.equal(parsed.length, 1);
	assert.deepEqual(parsed[0], entry);
});

test("zero-value fields are omitted on render", async () => {
	const { newEntry, renderMemoryFile } = await import("../src/memory.js");
	const entry = newEntry("recipe", "recipe-test-1");
	entry.title = "t";
	entry.solution = "s";
	const text = renderMemoryFile("recipe", [entry]);
	assert.ok(!text.includes("hits:"), "hits omitted when 0");
	assert.ok(!text.includes("enabled:"), "enabled omitted when true");
	assert.ok(!text.includes("supersedes:"), "supersedes omitted when empty");
});

test("entries without a title are dropped on parse", async () => {
	const { parseMemoryFile } = await import("../src/memory.js");
	const text = [
		"# dsh-error-improvement memory: lessons",
		"<!-- format: v1 -->",
		"",
		"## lesson-a",
		"- mistake: something",
		"",
		"## lesson-b",
		"- title: kept",
		"- prevention: rule",
	].join("\n");
	const parsed = parseMemoryFile(text, "lesson");
	assert.equal(parsed.length, 1);
	assert.equal(parsed[0]?.id, "lesson-b");
});

test("upsertEntry creates and updates; updateEntries mutates in place", async () => {
	const { memoryFile } = await import("../src/paths.js");
	const { newEntry, readEntries, updateEntries, upsertEntry } = await import(
		"../src/memory.js"
	);
	const file = memoryFile("lessons");
	const entry = newEntry("lesson", "lesson-upsert-1");
	entry.title = "v1";
	entry.prevention = "p";
	upsertEntry(file, "lesson", entry);

	entry.title = "v2";
	upsertEntry(file, "lesson", entry);
	assert.equal(readEntries(file, "lesson").length, 1);
	assert.equal(readEntries(file, "lesson")[0]?.title, "v2");

	const changed = updateEntries(file, "lesson", (candidate) => {
		candidate.hits += 1;
		return candidate;
	});
	assert.equal(changed.length, 1);
	assert.equal(readEntries(file, "lesson")[0]?.hits, 1);
});

test("readEntries fails open on a missing file", async () => {
	const { readEntries } = await import("../src/memory.js");
	assert.deepEqual(readEntries(join(home, "nope.md"), "lesson"), []);
});
