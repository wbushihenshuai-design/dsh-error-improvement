import assert from "node:assert/strict";
import test from "node:test";

import type { PreStepDecision } from "@deepseek-ai/dsh-agent";
import type { UserMessage } from "@deepseek-ai/dsh-llm";

import { improveDecision } from "../src/index.js";

const confirmedLesson = {
	id: "one",
	title: "Verify target profile",
	mistake: "Edited the wrong profile",
	prevention: "Inspect the active profile before editing",
	scope: "DSH profile",
	keywords: "profile",
	confirmed: true,
	enabled: true,
};

function userMessage(text: string): UserMessage {
	return {
		id: `user-${text}`,
		content: [{ type: "text", text }],
		source: { kind: "user" },
	} as unknown as UserMessage;
}

test("preserves rejected decisions by identity", () => {
	const rejected: PreStepDecision = { kind: "reject" };
	assert.equal(
		improveDecision(rejected, false, {
			mode: "strict",
			lessons: [confirmedLesson],
		}),
		rejected,
	);
});

test("does not manufacture a request from an empty enter decision", () => {
	const empty: PreStepDecision = {
		kind: "enter",
		messages: [],
		startsRequestSeries: true,
	};
	assert.equal(
		improveDecision(empty, false, {
			mode: "strict",
			lessons: [confirmedLesson],
		}),
		empty,
	);
});

test("does not inject after abort", () => {
	const decision: PreStepDecision = {
		kind: "enter",
		messages: [userMessage("profile work")],
	};
	assert.equal(
		improveDecision(decision, true, {
			mode: "strict",
			lessons: [confirmedLesson],
		}),
		decision,
	);
});

test("preserves enter metadata and appends a separately attributed message", () => {
	const decision: PreStepDecision = {
		kind: "enter",
		messages: [userMessage("inspect profile")],
		startsRequestSeries: true,
	};
	const improved = improveDecision(decision, false, {
		mode: "strict",
		lessons: [confirmedLesson],
	});
	assert.notEqual(improved, decision);
	assert.equal(improved.kind, "enter");
	if (improved.kind !== "enter")
		throw new Error("unexpected rejected decision");
	assert.equal(improved.startsRequestSeries, true);
	assert.equal(improved.messages.length, 2);
	assert.equal(improved.messages[0], decision.messages[0]);
	assert.deepEqual(improved.messages[1]?.source, {
		kind: "plugin",
		plugin: "dsh-error-improvement",
		form: "instructions",
	});
});

test("unconfirmed lessons are never injected", () => {
	const decision: PreStepDecision = {
		kind: "enter",
		messages: [userMessage("inspect profile")],
	};
	const result = improveDecision(decision, false, {
		mode: "strict",
		lessons: [{ ...confirmedLesson, confirmed: false }],
	});
	assert.equal(result, decision);
});
