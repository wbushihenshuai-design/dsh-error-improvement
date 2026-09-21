import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	argsOverlap,
	guardDecision,
	matchPromotion,
	observeToolResult,
} from "../src/enforcement.js";
import { ImprovementStore, type Promotion } from "../src/store.js";

function tempStore(): { store: ImprovementStore; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "dsh-ei-test-"));
	const store = new ImprovementStore(join(dir, "state.json"));
	return {
		store,
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const failureResult = {
	isError: true,
	error: { message: "ENOENT: no such file or directory" },
	content: [{ type: "text", text: "read failed" }],
};

const pwshExec = {
	name: "pwsh",
	arguments: { command: "Get-Content missing.txt", description: "read file" },
};

test("argsOverlap treats two empty argument sets as identical", () => {
	assert.equal(argsOverlap("", ""), 1);
	assert.equal(argsOverlap("{}", ""), 0);
	assert.equal(argsOverlap("some command here", ""), 0);
});

test("argsOverlap scores shared tokens", () => {
	const recorded = '{"command":"get-content missing.txt"}';
	const similar = '{"command":"Get-Content missing.txt","description":"x"}';
	const different = '{"command":"Get-Process"}';
	assert.ok(argsOverlap(similar, recorded) >= 0.34);
	assert.ok(argsOverlap(different, recorded) < 0.34);
});

test("matchPromotion only matches same tool with overlapping args", () => {
	const promotion: Promotion = {
		signature: "pwsh|enoent",
		tool: "pwsh",
		argsHint: '{"command":"get-content missing.txt"}',
		mode: "warn",
		reason: "stop repeating",
		count: 3,
		promotedAt: 1,
	};
	assert.equal(
		matchPromotion([promotion], "pwsh", '{"command":"Get-Content missing.txt"}')
			?.signature,
		"pwsh|enoent",
	);
	assert.equal(
		matchPromotion([promotion], "read", '{"command":"Get-Content"}'),
		undefined,
	);
	assert.equal(
		matchPromotion([promotion], "pwsh", '{"command":"Get-Process"}'),
		undefined,
	);
});

test("observeToolResult promotes a rule exactly at the threshold", () => {
	const { store, cleanup } = tempStore();
	try {
		const settings = { enforcement: { threshold: 3 } };
		for (let index = 0; index < 2; index += 1) {
			observeToolResult(pwshExec, failureResult, settings, store);
		}
		assert.equal(store.data.promotions.length, 0);
		observeToolResult(pwshExec, failureResult, settings, store);
		assert.equal(store.data.promotions.length, 1);
		// Further failures do not duplicate the rule.
		observeToolResult(pwshExec, failureResult, settings, store);
		assert.equal(store.data.promotions.length, 1);
		assert.equal(store.data.promotions[0]?.mode, "warn");
	} finally {
		cleanup();
	}
});

test("observeToolResult ignores successes and disabled enforcement", () => {
	const { store, cleanup } = tempStore();
	try {
		observeToolResult(pwshExec, { isError: false, content: [] }, {}, store);
		observeToolResult(pwshExec, failureResult, { enabled: false }, store);
		observeToolResult(
			pwshExec,
			failureResult,
			{ enforcement: { enabled: false } },
			store,
		);
		assert.equal(Object.keys(store.data.errors).length, 0);
	} finally {
		cleanup();
	}
});

test("guardDecision warns once then allows within the cooldown", () => {
	const promotion: Promotion = {
		signature: "pwsh|enoent",
		tool: "pwsh",
		argsHint: "",
		mode: "warn",
		reason: "stop repeating",
		count: 3,
		promotedAt: 1,
	};
	const first = guardDecision(promotion, {}, 10_000);
	assert.equal(first.decision.kind, "deny");
	assert.equal(first.warned, true);
	const warnedPromotion = { ...promotion, warnedAt: 10_000 };
	const second = guardDecision(warnedPromotion, {}, 20_000);
	assert.equal(second.decision.kind, "allow");
	const afterCooldown = guardDecision(
		warnedPromotion,
		{ enforcement: { warnCooldownMs: 60_000 } },
		10_000 + 61_000,
	);
	assert.equal(afterCooldown.decision.kind, "deny");
});

test("guardDecision deny mode always blocks", () => {
	const promotion: Promotion = {
		signature: "pwsh|enoent",
		tool: "pwsh",
		argsHint: "",
		mode: "deny",
		reason: "never do this",
		count: 5,
		promotedAt: 1,
		warnedAt: 9_000,
	};
	const outcome = guardDecision(promotion, {}, 10_000);
	assert.equal(outcome.decision.kind, "deny");
	assert.equal(outcome.warned, false);
	if (outcome.decision.kind === "deny") {
		assert.match(outcome.decision.reason, /never do this/u);
	}
});
