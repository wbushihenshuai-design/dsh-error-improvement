import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	graduateRecipe,
	recordRecipe,
	renderAll,
	renderRecipes,
} from "../src/recipes.js";
import { ImprovementStore } from "../src/store.js";

function tempDir(): { dir: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "dsh-ei-recipe-"));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const sampleRecipe = {
	id: "r1",
	title: "DSH self-restart via detached WMI script",
	problem: "Restarting DSH from inside a tool call kills the calling process",
	solution:
		"Write a helper .ps1 that uses WMI Win32_Process Create to spawn a detached restarter, run it, then exit.",
	scope: "DSH restart, self-restart",
	keywords: "restart, wmi, detached",
	confirmed: true,
	enabled: true,
};

test("renderRecipes surfaces relevant confirmed recipes", () => {
	const rendered = renderRecipes(
		[sampleRecipe],
		"how do I restart DSH safely",
		4000,
		3,
		false,
	);
	assert.ok(rendered);
	assert.match(rendered ?? "", /success_recipes/u);
	assert.match(rendered ?? "", /detached restarter/u);
});

test("renderRecipes skips unconfirmed or irrelevant recipes", () => {
	assert.equal(
		renderRecipes(
			[{ ...sampleRecipe, confirmed: false }],
			"restart dsh",
			4000,
			3,
			false,
		),
		undefined,
	);
	assert.equal(
		renderRecipes(
			[sampleRecipe],
			"unrelated database question",
			4000,
			3,
			false,
		),
		undefined,
	);
});

test("renderAll combines lessons and recipes in one message", () => {
	const lesson = {
		id: "l1",
		title: "Avoid repeated identical tool calls",
		mistake: "Fired 3+ identical calls",
		prevention: "Change approach on the third attempt",
		scope: "tool calls",
		keywords: "restart, loop",
		confirmed: true,
		enabled: true,
	};
	const combined = renderAll(
		{ mode: "strict", lessons: [lesson], recipes: [] },
		"restart dsh",
		[sampleRecipe],
	);
	assert.ok(combined);
	assert.match(combined ?? "", /error_improvement_lessons/u);
	assert.match(combined ?? "", /success_recipes/u);
	// Ordering: lessons first, recipes second.
	const text = combined ?? "";
	assert.ok(
		text.indexOf("error_improvement_lessons") < text.indexOf("success_recipes"),
	);
});

test("recordRecipe persists to the store and reload survives", () => {
	const { dir, cleanup } = tempDir();
	try {
		const path = join(dir, "state.json");
		const store = new ImprovementStore(path);
		const result = recordRecipe(store, {
			title: sampleRecipe.title,
			problem: sampleRecipe.problem,
			solution: sampleRecipe.solution,
			keywords: sampleRecipe.keywords,
		});
		assert.ok(result.id.startsWith("recipe-"));
		store.flush();
		const reloaded = new ImprovementStore(path);
		assert.equal(reloaded.data.recipes.length, 1);
		assert.equal(reloaded.data.recipes[0]?.title, sampleRecipe.title);
	} finally {
		cleanup();
	}
});

test("recordRecipe rejects missing title or solution", () => {
	const { dir, cleanup } = tempDir();
	try {
		const store = new ImprovementStore(join(dir, "state.json"));
		const result = recordRecipe(store, {
			title: "",
			problem: "x",
			solution: "",
		});
		assert.match(result.message, /NOT RECORDED/u);
		assert.equal(store.data.recipes.length, 0);
	} finally {
		cleanup();
	}
});

test("graduateRecipe writes a SKILL.md with frontmatter", () => {
	const { dir, cleanup } = tempDir();
	const previousHome = process.env.DSH_HOME;
	process.env.DSH_HOME = dir;
	try {
		const file = graduateRecipe(sampleRecipe);
		assert.ok(existsSync(file));
		const content = readFileSync(file, "utf8");
		assert.match(
			content,
			/^---\nname: dsh-self-restart-via-detached-wmi-script/u,
		);
		assert.match(content, /## Solution/u);
	} finally {
		if (previousHome === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = previousHome;
		cleanup();
	}
});
