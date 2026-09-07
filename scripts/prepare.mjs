// Runs on `npm install` / `git clone` / pnpm prepare.
// Skips the build when lib/ already exists (published tarball or pre-built clone).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../", import.meta.url));
const libExists = existsSync(join(here, "lib", "index.js"));

if (libExists) {
	console.log("prepare: lib/ already built, skipping");
} else {
	execFileSync("npm", ["run", "build"], {
		cwd: here,
		stdio: "inherit",
	});
}
