import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let home = "";

before(() => {
	home = mkdtempSync(join(tmpdir(), "dsh-ei-recipes-"));
	process.env.DSH_HOME = home;
});

after(() => {
	rmSync(home, { recursive: true, force: true });
});

test("recordRecipe writes a confirmed validated entry to recipes.md", async () => {
	const recipes = await import("../src/recipes.js");
	const result = recipes.recordRecipe({
		title: "Fix flaky npm ci",
		problem: "npm ci fails with ETARGET in CI",
		solution: "pin registry and retry with cache clean",
		keywords: "npm, ci",
	});
	assert.ok(result.id.startsWith("recipe-"));
	assert.ok(result.message.includes(result.id));

	const loaded = recipes.loadRecipes();
	assert.equal(loaded.length, 1);
	assert.equal(loaded[0]?.title, "Fix flaky npm ci");
	assert.equal(loaded[0]?.confirmed, true);
	assert.equal(loaded[0]?.maturity, "validated");
	assert.equal(loaded[0]?.attributedTo, "agent:improve_record_recipe");
});

test("recordRecipe refuses entries without title or solution", async () => {
	const recipes = await import("../src/recipes.js");
	assert.ok(
		recipes
			.recordRecipe({ solution: "only" })
			.message.startsWith("NOT RECORDED"),
	);
	assert.ok(
		recipes.recordRecipe({ title: "only" }).message.startsWith("NOT RECORDED"),
	);
	assert.equal(recipes.loadRecipes().length, 1, "nothing appended");
});

test("selectRecipes picks relevant recipes; render respects budget", async () => {
	const recipes = await import("../src/recipes.js");
	recipes.recordRecipe({
		title: "docker build cache",
		problem: "docker build slow",
		solution: "order layers",
		keywords: "docker, build",
	});
	recipes.recordRecipe({
		title: "unrelated",
		problem: "typescript types",
		solution: "zod",
		keywords: "types",
	});
	const all = recipes.loadRecipes();
	assert.equal(all.length, 3);
	const picked = recipes.selectRecipes(all, "docker build 太慢", 10, false);
	assert.equal(picked.length, 1);
	assert.equal(picked[0]?.title, "docker build cache");

	const tiny = recipes.renderRecipes(
		all,
		"docker build",
		{ mode: "assist", maxRecipes: 20 },
		10,
	);
	assert.equal(tiny.text, "", "budget below header -> empty");

	const rendered = recipes.renderRecipes(
		all,
		"docker build",
		{ mode: "assist", maxRecipes: 20 },
		800,
	);
	assert.ok(rendered.text.length <= 800);
	assert.ok(rendered.ids.length >= 1);
	assert.ok(rendered.text.includes("<SUBAGENT-STOP>"));
});
