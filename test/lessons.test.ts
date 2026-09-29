import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoryEntry } from "../src/memory.js";

const lessons = await import("../src/lessons.js");
const memory = await import("../src/memory.js");

function lesson(id: string, fields: Partial<MemoryEntry> = {}): MemoryEntry {
	const entry = memory.newEntry("lesson", id);
	entry.title = id;
	entry.confirmed = true;
	entry.mistake = "did the wrong thing";
	entry.prevention = "do the right thing";
	entry.keywords = "deploy, docker";
	Object.assign(entry, fields);
	return entry;
}

const assist = { mode: "assist" as const, maxLessons: 10, maxChars: 6000 };

test("assist mode scores by query relevance and drops unconfirmed entries", () => {
	const entries = [
		lesson("lesson-on", { keywords: "docker 部署 容器" }),
		lesson("lesson-off", { enabled: false }),
		lesson("lesson-unconfirmed", { confirmed: false }),
	];
	const picked = lessons.selectLessons(
		entries,
		"docker 部署 时容器起不来",
		assist,
	);
	assert.deepEqual(
		picked.map((entry) => entry.id),
		["lesson-on"],
	);
});

test("strict mode injects every enabled confirmed entry up to maxLessons", () => {
	const entries = [lesson("a"), lesson("b"), lesson("c")];
	const picked = lessons.selectLessons(entries, "无关问题", {
		mode: "strict" as const,
		maxLessons: 2,
	});
	assert.equal(picked.length, 2);
});

test("superseded entries are retired from selection", () => {
	const oldEntry = lesson("old", { keywords: "same" });
	const fresh = lesson("new", { supersedes: "old", keywords: "same" });
	const picked = lessons.selectLessons([oldEntry, fresh], "same", {
		mode: "strict" as const,
		maxLessons: 10,
	});
	assert.deepEqual(
		picked.map((entry) => entry.id),
		["new"],
	);
});

test("renderLessons measures and degrades whole entries within budget", () => {
	const entries = Array.from({ length: 8 }, (_, index) =>
		lesson(`lesson-${index}`, {
			mistake: "x".repeat(500),
			prevention: "y".repeat(500),
		}),
	);
	const rendered = lessons.renderLessons(
		entries,
		"anything",
		{ mode: "strict" as const, maxLessons: 50, maxChars: 2000 },
		2000,
	);
	assert.ok(rendered.ids.length < entries.length, "some entries dropped");
	assert.ok(
		rendered.text.length <= 2000,
		"header + body + footer within budget",
	);
	assert.ok(rendered.text.includes("<EXTREMELY_IMPORTANT>"));
	assert.ok(rendered.text.includes("<SUBAGENT-STOP>"));
});

test("renderLessons returns an empty result in off mode or with no matches", () => {
	const entries = [lesson("a")];
	assert.deepEqual(
		lessons.renderLessons(entries, "a", {
			mode: "off" as const,
			maxLessons: 5,
			maxChars: 6000,
		}),
		{ text: "", ids: [] },
	);
	assert.deepEqual(
		lessons.renderLessons(entries, "zzzzz 无关", {
			mode: "assist" as const,
			maxLessons: 5,
			maxChars: 6000,
		}),
		{ text: "", ids: [] },
	);
});

test("lessonMessage carries plugin source metadata", () => {
	const message = lessons.lessonMessage("hello");
	assert.equal(message.source.kind, "plugin");
	assert.equal(message.source.plugin, "dsh-error-improvement");
	assert.equal(message.source.form, "instructions");
});
