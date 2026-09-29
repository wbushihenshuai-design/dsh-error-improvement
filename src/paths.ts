/** Filesystem layout shared by every module of the plugin. */

import { homedir } from "node:os";
import { join } from "node:path";

export function dshHome(): string {
	const env = process.env.DSH_HOME;
	return env?.trim() ? env : join(homedir(), ".dsh");
}

/** Root of the md-native memory layer: lessons.md / recipes.md / decisions.md. */
export function memoryRoot(): string {
	return join(dshHome(), "error-improvement", "memory");
}

export function memoryFile(kind: "lessons" | "recipes" | "decisions"): string {
	return join(memoryRoot(), `${kind}.md`);
}

/** Pending user-confirmation drafts produced by distillation / graduation. */
export function draftsRoot(): string {
	return join(memoryRoot(), "drafts");
}

/** Append-only raw capture queue consumed by the distiller. */
export function candidatesFile(): string {
	return join(memoryRoot(), "candidates.jsonl");
}

export function skillsRoot(): string {
	return join(dshHome(), "skills");
}

export function legacySettingsYaml(): string {
	return join(dshHome(), "settings.yaml.imported");
}

export function legacyStateFile(): string {
	return join(dshHome(), "error-improvement", "state.json");
}
