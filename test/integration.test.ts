import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import type { PreStepDecision } from "@deepseek-ai/dsh-agent";
import type { UserMessage } from "@deepseek-ai/dsh-llm";

import { apply } from "../src/index.js";
import type { ErrorImprovementSettings } from "../src/lessons.js";

function directUser(text: string): UserMessage {
	return {
		id: `user-${text}`,
		content: [{ type: "text", text }],
		source: { kind: "user" },
	} as unknown as UserMessage;
}

const confirmed: ErrorImprovementSettings = {
	enabled: true,
	mode: "strict",
	lessons: [
		{
			id: "confirmed",
			title: "Check the active profile",
			mistake: "Edited the wrong profile",
			prevention: "Confirm the active profile before editing",
			confirmed: true,
			enabled: true,
		},
	],
};

test("host follows the current settings getter and fails open after fallback", async () => {
	let source: () => ErrorImprovementSettings = () => confirmed;
	let registeredNamespace = "";
	let registeredOwner: unknown;
	let middleware:
		| ((
				payload: { signal: AbortSignal; step: number },
				next: () => Promise<PreStepDecision>,
		  ) => Promise<PreStepDecision>)
		| undefined;
	const changes: string[] = [];

	const fakeContext = {
		logger: { info: () => {}, warn: () => {}, error: () => {} },
		inject: (_services: string[], callback: (ctx: unknown) => void) => {
			callback({
				settings: {
					installSection: (
						owner: unknown,
						namespace: string,
						_schema: unknown,
						_entry: ErrorImprovementSettings,
						hooks: {
							setSource: (getter: () => ErrorImprovementSettings) => void;
							onChange: () => void;
						},
					) => {
						registeredOwner = owner;
						registeredNamespace = namespace;
						hooks.setSource(() => source());
						changes.push("setSource");
						hooks.onChange();
						changes.push("onChange");
					},
				},
			});
			return { dispose: () => {} };
		},
		on: (event: string, callback: typeof middleware, _options: unknown) => {
			if (event === "agent/pre-step") middleware = callback;
			return () => {};
		},
	} as unknown as Context;

	apply(fakeContext);
	assert.equal(registeredOwner, fakeContext);
	assert.equal(registeredNamespace, "error-improvement");
	assert.deepEqual(changes, ["setSource", "onChange"]);
	assert.ok(middleware);

	const downstream: PreStepDecision = {
		kind: "enter",
		messages: [directUser("work on the profile")],
		startsRequestSeries: true,
	};
	const first = await middleware(
		{ signal: new AbortController().signal, step: 1 },
		async () => downstream,
	);
	assert.equal(first.kind, "enter");
	if (first.kind !== "enter") throw new Error("unexpected reject");
	assert.equal(first.messages.length, 2);
	assert.equal(first.startsRequestSeries, true);

	source = () => ({ enabled: false, lessons: [] });
	const afterFallback = await middleware(
		{ signal: new AbortController().signal, step: 1 },
		async () => downstream,
	);
	assert.equal(afterFallback, downstream);
});

test("host returns downstream decisions unchanged if current settings getter throws", async () => {
	let middleware:
		| ((
				payload: { signal: AbortSignal; step: number },
				next: () => Promise<PreStepDecision>,
		  ) => Promise<PreStepDecision>)
		| undefined;
	const warnings: string[] = [];
	const fakeContext = {
		logger: {
			info: () => {},
			warn: (message: string) => warnings.push(message),
			error: () => {},
		},
		inject: (_services: string[], callback: (ctx: unknown) => void) => {
			callback({
				settings: {
					installSection: (
						_owner: unknown,
						_namespace: string,
						_schema: unknown,
						_entry: ErrorImprovementSettings,
						hooks: {
							setSource: (getter: () => ErrorImprovementSettings) => void;
							onChange: () => void;
						},
					) => {
						hooks.setSource(() => {
							throw new Error("detached provider");
						});
						hooks.onChange();
					},
				},
			});
			return { dispose: () => {} };
		},
		on: (event: string, callback: typeof middleware) => {
			if (event === "agent/pre-step") middleware = callback;
			return () => {};
		},
	} as unknown as Context;

	apply(fakeContext);
	assert.ok(middleware);
	const downstream: PreStepDecision = {
		kind: "enter",
		messages: [directUser("profile")],
	};
	const result = await middleware(
		{ signal: new AbortController().signal, step: 1 },
		async () => downstream,
	);
	assert.equal(result, downstream);
	assert.ok(warnings.length >= 1);
	assert.ok(warnings.some((warning) => /failed open/u.test(warning)));
});
