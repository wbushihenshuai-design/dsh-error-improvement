import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let home = "";

before(() => {
	home = mkdtempSync(join(tmpdir(), "dsh-ei-store-"));
	process.env.DSH_HOME = home;
	mkdirSync(join(home, "error-improvement"), { recursive: true });
});

after(() => {
	rmSync(home, { recursive: true, force: true });
});

test("v1 state.json loads recipes into transient legacyRecipes", async () => {
	const { legacyStateFile } = await import("../src/paths.js");
	writeFileSync(
		legacyStateFile(),
		JSON.stringify({
			version: 1,
			errors: {},
			promotions: [],
			recipes: [
				{
					id: "recipe-legacy-1",
					title: "Legacy recipe",
					problem: "p",
					solution: "s",
					scope: "",
					keywords: "",
					confirmed: true,
					enabled: true,
					createdAt: "2026-01-01T00:00:00.000Z",
				},
			],
		}),
	);
	const { ImprovementStore } = await import("../src/store.js");
	const store = new ImprovementStore();
	assert.equal(store.legacyRecipes.length, 1);
	assert.equal(store.legacyRecipes[0]?.title, "Legacy recipe");
	assert.equal(store.data.version, 2);
	assert.equal(store.data.migrated.stateRecipes, false);
});

test("recordError accumulates by signature and returns the record", async () => {
	const { ImprovementStore } = await import("../src/store.js");
	const store = new ImprovementStore(join(home, "state-b.json"));
	for (let index = 0; index < 3; index += 1) {
		store.recordError("run_command", "npm ci", "ETARGET not found");
	}
	const records = Object.values(store.data.errors);
	assert.equal(records.length, 1);
	assert.equal(records[0]?.count, 3);
	assert.equal(records[0]?.tool, "run_command");
});

test("promote dedupes by signature and evicts oldest unlinked rules beyond the cap", async () => {
	const { ImprovementStore } = await import("../src/store.js");
	const store = new ImprovementStore(join(home, "state-c.json"));
	const first = store.promote(
		{
			signature: "sig-1",
			tool: "t",
			argsHint: "",
			mode: "warn",
			reason: "r",
			count: 3,
		},
		1,
	);
	const duplicate = store.promote(
		{
			signature: "sig-1",
			tool: "t",
			argsHint: "",
			mode: "warn",
			reason: "r",
			count: 3,
		},
		1,
	);
	assert.equal(
		duplicate.promotedAt,
		first.promotedAt,
		"dedup returns existing",
	);
	store.promote(
		{
			signature: "sig-2",
			tool: "t",
			argsHint: "",
			mode: "warn",
			reason: "r",
			count: 3,
		},
		1,
	);
	assert.equal(store.data.promotions.length, 1, "cap enforced");
	assert.equal(
		store.data.promotions[0]?.signature,
		"sig-2",
		"oldest unlinked evicted",
	);
});

test("normalizeText collapses long hex/digit runs for stable signatures", async () => {
	const { errorSignature, normalizeText } = await import("../src/store.js");
	assert.equal(
		normalizeText("failed with code 12345678ab"),
		normalizeText("failed with code 87654321cd"),
	);
	assert.equal(
		errorSignature("tool", "failed with code 12345678ab"),
		errorSignature("tool", "failed with code 87654321cd"),
	);
});

test("flush persists version-2 state reloadable from disk", async () => {
	const { ImprovementStore } = await import("../src/store.js");
	const path = join(home, "state-d.json");
	const store = new ImprovementStore(path);
	store.recordError("edit", "file.ts", "mismatch");
	store.flush();
	const reloaded = new ImprovementStore(path);
	assert.equal(Object.keys(reloaded.data.errors).length, 1);
	assert.equal(reloaded.data.version, 2);
});

test("corrupt state files fail open to an empty store", async () => {
	const { ImprovementStore } = await import("../src/store.js");
	const path = join(home, "state-corrupt.json");
	writeFileSync(path, "{not json");
	const store = new ImprovementStore(path);
	assert.equal(Object.keys(store.data.errors).length, 0);
});
