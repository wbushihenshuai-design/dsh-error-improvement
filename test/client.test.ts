import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

interface EditorState {
	draft: Record<string, unknown>;
	dirty: boolean;
	baseRevision: number;
	saving: boolean;
}

interface EditorController {
	getState: () => EditorState;
	update: (
		change: (draft: Record<string, unknown>) => Record<string, unknown>,
	) => boolean;
	reset: (snapshot: ScopeSnapshot) => boolean;
	observe: (snapshot: ScopeSnapshot) => string;
	save: (scope: FakeScope) => Promise<{ kind: string; error?: unknown }>;
}

interface ClientPlugin {
	inject: string[];
	apply: (ctx: Record<string, unknown>) => void;
	__test: {
		createEditorController: (snapshot: ScopeSnapshot) => EditorController;
		normalize: (value: unknown) => Record<string, unknown>;
	};
}

interface ScopeSnapshot {
	status: string;
	writable: boolean;
	revision: number;
	value: Record<string, unknown>;
}

interface FakeScope {
	getSnapshot: () => ScopeSnapshot;
	mutate: (ops: unknown[], revision: number) => Promise<void>;
}

async function loadPlugin(): Promise<ClientPlugin> {
	const source = await readFile(
		new URL("../src/client.js", import.meta.url),
		"utf8",
	);
	let factory: ((require: (id: string) => unknown) => ClientPlugin) | undefined;
	const window = {
		__ModuleLoader__: {
			load: (entry: { id: string; factory: typeof factory }) => {
				assert.equal(entry.id, "dsh-error-improvement");
				factory = entry.factory;
			},
		},
	};
	vm.runInNewContext(source, { window }, { filename: "client.js" });
	assert.ok(factory);
	const fakeReact = {
		useSyncExternalStore: () => ({}),
		useState: (value: unknown) => [
			typeof value === "function" ? (value as () => unknown)() : value,
			() => {},
		],
		useEffect: () => {},
	};
	const fakeJsx = { jsx: () => null, jsxs: () => null };
	return factory((id) => {
		if (id === "react") return fakeReact;
		if (id === "react/jsx-runtime") return fakeJsx;
		throw new Error(`unexpected client dependency: ${id}`);
	});
}

function snapshot(revision: number, mode = "assist"): ScopeSnapshot {
	return {
		status: "ready",
		writable: true,
		revision,
		value: { enabled: true, mode, maxLessons: 5, maxChars: 6000, lessons: [] },
	};
}

function editMode(controller: EditorController, mode: string): void {
	assert.equal(
		controller.update((draft) => ({ ...draft, mode })),
		true,
	);
}

test("client waits for the settings slot and binds only the Host namespace", async () => {
	const plugin = await loadPlugin();
	assert.deepEqual(Array.from(plugin.inject), [
		"slots",
		"locale",
		"settingsScope",
	]);

	let slotReady: (() => unknown) | undefined;
	let boundNamespace = "";
	let registeredSection = "";
	const context = {
		effect: (callback: () => unknown) => callback(),
		locale: { register: () => () => {}, bind: () => (key: string) => key },
		settingsScope: {
			bind: ({ namespace }: { namespace: string }) => {
				boundNamespace = namespace;
				return {};
			},
		},
		slots: {
			inject: (name: string, callback: () => unknown) => {
				assert.equal(name, "settings.section");
				slotReady = callback;
			},
			register: (descriptor: { id: string }, _component: unknown) => {
				registeredSection = descriptor.id;
				return () => {};
			},
		},
	};

	plugin.apply(context);
	assert.equal(boundNamespace, "error-improvement");
	assert.equal(registeredSection, "");
	assert.ok(slotReady);
	slotReady();
	assert.equal(registeredSection, "error-improvement");
});

test("resolved rejected writes remain dirty and never report saved", async () => {
	const { createEditorController } = (await loadPlugin()).__test;
	const controller = createEditorController(snapshot(1));
	editMode(controller, "strict");
	let current = snapshot(1);
	const result = await controller.save({
		mutate: async (_ops, revision) => {
			assert.equal(revision, 1);
			current = snapshot(2, "assist");
		},
		getSnapshot: () => current,
	});
	assert.equal(result.kind, "rejected");
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().draft.mode, "strict");
});

test("transport errors keep the draft for retry", async () => {
	const { createEditorController } = (await loadPlugin()).__test;
	const controller = createEditorController(snapshot(4));
	editMode(controller, "strict");
	const result = await controller.save({
		mutate: async () => {
			throw new Error("network down");
		},
		getSnapshot: () => snapshot(4),
	});
	assert.equal(result.kind, "error");
	assert.equal(controller.getState().dirty, true);
});

test("external updates preserve dirty drafts and signal a conflict", async () => {
	const { createEditorController } = (await loadPlugin()).__test;
	const controller = createEditorController(snapshot(1));
	editMode(controller, "strict");
	assert.equal(controller.observe(snapshot(2, "assist")), "conflict");
	assert.equal(controller.getState().draft.mode, "strict");
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().baseRevision, 2);
});

test("edits and duplicate saves are blocked while a save is in flight", async () => {
	const { createEditorController } = (await loadPlugin()).__test;
	const controller = createEditorController(snapshot(7));
	editMode(controller, "strict");
	let release: (() => void) | undefined;
	let current = snapshot(7);
	let calls = 0;
	const scope: FakeScope = {
		mutate: async (_ops, revision) => {
			calls += 1;
			assert.equal(revision, 7);
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			current = snapshot(8, "strict");
		},
		getSnapshot: () => current,
	};
	const first = controller.save(scope);
	assert.equal(controller.getState().saving, true);
	assert.equal(
		controller.update((draft) => ({ ...draft, mode: "assist" })),
		false,
	);
	const second = await controller.save(scope);
	assert.equal(second.kind, "busy");
	assert.equal(calls, 1);
	assert.ok(release);
	release();
	assert.equal((await first).kind, "saved");
	assert.equal(controller.getState().saving, false);
	assert.equal(controller.getState().dirty, false);
});

test("compaction normalization supplies primary and fallback route defaults", async () => {
	const { normalize } = (await loadPlugin()).__test;
	const value = normalize({
		compaction: {
			summarizationProvider: "primary",
			summarizationModel: "summary-v1",
			fallbackSummarizationProvider: "fallback",
			fallbackSummarizationModel: "summary-v2",
		},
	});
	assert.deepEqual(JSON.parse(JSON.stringify(value.compaction)), {
		enabled: true,
		thresholdRatio: 0.8,
		retainRatio: 0.16,
		summarizationProvider: "primary",
		summarizationModel: "summary-v1",
		fallbackSummarizationProvider: "fallback",
		fallbackSummarizationModel: "summary-v2",
		maxTokens: 8192,
	});
});

test("normalization assigns unique deterministic React keys", async () => {
	const { normalize } = (await loadPlugin()).__test;
	const value = normalize({
		lessons: [
			{ id: "same", title: "A", prevention: "A" },
			{ id: "same", title: "B", prevention: "B" },
			{ id: "", title: "C", prevention: "C" },
		],
	});
	const ids = (value.lessons as Array<{ id: string }>).map(
		(lesson) => lesson.id,
	);
	assert.deepEqual(ids, ["same", "same-2", "legacy-3"]);
});
