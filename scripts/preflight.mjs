import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const cwd = decodeURIComponent(root.pathname).replace(
	/^\/(?:[A-Za-z]:)/u,
	(match) => match.slice(1),
);
const libDir = join(cwd, "lib");

async function listLibJs() {
	const entries = await readdir(libDir);
	return entries.filter((f) => f.endsWith(".js"));
}

const jsFiles = await listLibJs();
assert.ok(
	jsFiles.length >= 3,
	`expected at least 3 JS files in lib/, found ${jsFiles.length}`,
);

const distributed = jsFiles
	.map((f) => readFile(join(libDir, f), "utf8"))
	.join("\n");

// --- Forbidden markers: no Desktop security, no EverOS, no network/FS coupling ---
const forbidden = [
	"openBrowser",
	"networkExposure",
	"permission.defaultPreset",
	"danger-full-access",
	"EVEROS",
	"evermind",
	"127.0.0.1:8000",
];

for (const marker of forbidden)
	assert.equal(
		distributed.includes(marker),
		false,
		`forbidden marker found: ${marker}`,
	);

// --- Verify the published files list includes every lib JS ---
const packageJson = JSON.parse(
	await readFile(new URL("package.json", root), "utf8"),
);
assert.equal(packageJson.name, "dsh-error-improvement");
assert.equal(packageJson.dsh.client.platform, "web");
assert.equal(packageJson.dsh.client.immediately, true);
assert.equal(packageJson.dsh.bundle.patch, "./cordis.patch.yml");
assert.ok(
	packageJson.files.some((f) => f.startsWith("lib/")),
	"lib/ must be in published files",
);
assert.ok(
	packageJson.files.includes("CHANGELOG.md"),
	"CHANGELOG.md must be in published files",
);

const patch = await readFile(new URL("cordis.patch.yml", root), "utf8");
assert.match(patch, /name:\s+dsh-error-improvement/u);

const host = await import(new URL("lib/index.js", root));
assert.equal(host.name, "dsh-error-improvement");
assert.deepEqual(host.inject, [
	"agents",
	"settings",
	"llm",
	"tokenMeter",
	"sessions",
]);
assert.equal(typeof host.apply, "function");

console.log(
	`preflight ok: scanned ${jsFiles.length} JS files, standalone host/client, no Desktop security or EverOS coupling`,
);
