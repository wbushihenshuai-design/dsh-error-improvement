import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const cwd = decodeURIComponent(root.pathname).replace(
	/^\/(?:[A-Za-z]:)/u,
	(match) => match.slice(1),
);
const temporary = await mkdtemp(join(tmpdir(), "dsh-error-improvement-pack-"));

function npm(args, options = {}) {
	const npmCli = process.env.npm_execpath;
	assert.ok(
		npmCli,
		"npm_execpath is required; run this script through npm run",
	);
	return execFileSync(process.execPath, [npmCli, ...args], {
		cwd,
		encoding: "utf8",
		...options,
	});
}

try {
	const packed = JSON.parse(
		npm([
			"pack",
			"--json",
			"--ignore-scripts",
			"--pack-destination",
			temporary,
		]),
	);
	assert.equal(packed.length, 1);
	const tarball = join(temporary, packed[0].filename);

	// --- Clean consumer: install ONLY the packed tarball + its declared deps ---
	const consumer = join(temporary, "consumer");
	const npmCli = process.env.npm_execpath;
	assert.ok(npmCli, "npm_execpath is required");
	await mkdir(consumer);
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify(
			{
				name: "dsh-error-improvement-smoke-consumer",
				private: true,
				dependencies: {
					"dsh-error-improvement": `file:${tarball}`,
				},
			},
			null,
			2,
		),
	);
	execFileSync(
		process.execPath,
		[npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund"],
		{
			cwd: consumer,
			encoding: "utf8",
		},
	);

	// --- Verify the consumer has the expected peer deps installed ---
	const installed = JSON.parse(
		readFileSync(
			join(consumer, "node_modules", "dsh-error-improvement", "package.json"),
			"utf8",
		),
	);
	assert.equal(installed.name, "dsh-error-improvement");
	assert.equal(installed.main, "lib/index.js");
	assert.ok(
		installed.files.some((file) => file.startsWith("lib/")),
		"lib/ must be in published files",
	);
	assert.ok(
		installed.files.includes("CHANGELOG.md"),
		"CHANGELOG.md must be in published files",
	);
	assert.equal(
		installed.files.some((file) => file.startsWith("src/")),
		false,
		"src/ must not be published",
	);

	// --- Import the installed package from the consumer context ---
	const pkgRoot = join(consumer, "node_modules", "dsh-error-improvement");
	const host = await import(
		pathToFileURL(join(pkgRoot, "lib", "index.js")).href
	);
	const lessons = await import(
		pathToFileURL(join(pkgRoot, "lib", "lessons.js")).href
	);

	assert.equal(host.name, "dsh-error-improvement");
	assert.equal(lessons.PLUGIN_NAME, "dsh-error-improvement");
	assert.equal(typeof host.apply, "function");
	assert.equal(typeof host.inject, "object");
	assert.equal(typeof lessons.renderLessons, "function");
	assert.equal(typeof lessons.selectLessons, "function");
	assert.equal(typeof lessons.relevanceScore, "function");
	assert.equal(typeof lessons.lessonMessage, "function");

	console.log(
		`pack smoke ok: ${packed[0].filename}, ${packed[0].files.length} files, clean consumer install verified`,
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
