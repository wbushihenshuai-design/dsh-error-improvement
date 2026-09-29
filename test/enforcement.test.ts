import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let home = "";

before(() => {
	home = mkdtempSync(join(tmpdir(), "dsh-ei-enforce-"));
	process.env.DSH_HOME = home;
});

after(() => {
	rmSync(home, { recursive: true, force: true });
});

type Handler = (...args: never[]) => unknown;

async function harness() {
	const { unwrapConfig } = await import("../src/config.js");
	const { ImprovementStore } = await import("../src/store.js");
	const { mountEnforcement } = await import("../src/enforcement.js");
	const config = unwrapConfig({});
	const store = new ImprovementStore(join(home, `state-${Math.random()}.json`));
	const handlers = new Map<string, Handler>();
	const ctx = {
		logger: { warn: () => {} },
		on(event: string, listener: Handler) {
			handlers.set(event, listener);
		},
	};
	mountEnforcement(
		ctx as never,
		() => config,
		() => [],
		store,
	);
	return { config, store, handlers };
}

function execLike(name: string, args: Record<string, unknown>) {
	return { name, args };
}

const allow = () => Promise.resolve({ kind: "allow" as const });

test("pre-execute warns once per cooldown for a matching promotion", async () => {
	const { config, store, handlers } = await harness();
	// argsHint mirrors the JSON-serialized args of the original failing call.
	const argsHint = JSON.stringify({ command: "npm ci" });
	const promotion = store.promote(
		{
			signature: "sig-a",
			tool: "run_command",
			argsHint,
			lessonId: "lesson-a",
			mode: "warn",
			reason: "test",
			count: 3,
		},
		10,
	);
	const pre = handlers.get("tools/pre-execute") as unknown as (
		exec: unknown,
		next: () => Promise<{ kind: string }>,
	) => Promise<{ kind: string }>;

	// Warn mode soft-denies once per cooldown window.
	const first = await pre(
		execLike("run_command", { command: "npm ci" }),
		allow,
	);
	assert.equal(first.kind, "deny");
	assert.ok((store.data.promotions[0]?.warnedAt ?? 0) > 0);

	const second = await pre(
		execLike("run_command", { command: "npm ci" }),
		allow,
	);
	assert.equal(second.kind, "allow", "cooldown suppresses repeat warnings");

	config.enforcement.defaultMode = "deny";
	promotion.mode = "deny";
	const third = await pre(
		execLike("run_command", { command: "npm ci" }),
		allow,
	);
	assert.equal(third.kind, "deny");
});

test("pre-execute passes through when disabled", async () => {
	const { config, store, handlers } = await harness();
	config.enforcement.enabled = false;
	store.promote(
		{
			signature: "sig-b",
			tool: "edit",
			argsHint: "",
			mode: "warn",
			reason: "r",
			count: 3,
		},
		10,
	);
	const pre = handlers.get("tools/pre-execute") as unknown as (
		exec: unknown,
		next: () => Promise<{ kind: string }>,
	) => Promise<{ kind: string }>;
	const decision = await pre(execLike("edit", { file_path: "a" }), allow);
	assert.equal(decision.kind, "allow");
});

test("post-execute records error stats and promotes at the threshold", async () => {
	const { store, handlers } = await harness();
	const post = handlers.get("tools/post-execute") as unknown as (
		exec: unknown,
		result: unknown,
		next: () => Promise<{ kind: string }>,
	) => Promise<unknown>;
	for (let index = 0; index < 3; index += 1) {
		await post(
			execLike("run_command", { command: "npm ci" }),
			{ isError: true, content: [{ type: "text", text: "ETARGET not found" }] },
			allow,
		);
	}
	const records = Object.values(store.data.errors);
	assert.equal(records.length, 1);
	assert.equal(records[0]?.count, 3);
	assert.equal(
		store.data.promotions.length,
		1,
		"threshold reached -> promotion",
	);
});

test("enforcement fails open when the guard throws", async () => {
	const { ImprovementStore } = await import("../src/store.js");
	const { mountEnforcement } = await import("../src/enforcement.js");
	const store = new ImprovementStore(join(home, "state-f.json"));
	const handlers = new Map<string, Handler>();
	const ctx = {
		logger: { warn: () => {} },
		on(event: string, listener: Handler) {
			handlers.set(event, listener);
		},
	};
	mountEnforcement(
		ctx as never,
		() => {
			throw new Error("boom");
		},
		() => [],
		store,
	);
	const pre = handlers.get("tools/pre-execute") as unknown as (
		exec: unknown,
		next: () => Promise<{ kind: string }>,
	) => Promise<{ kind: string }>;
	const decision = await pre(execLike("edit", {}), allow);
	assert.equal(decision.kind, "allow");
});
