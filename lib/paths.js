/** Filesystem layout shared by every module of the plugin. */
import { homedir } from "node:os";
import { join } from "node:path";
export function dshHome() {
    const env = process.env.DSH_HOME;
    return env?.trim() ? env : join(homedir(), ".dsh");
}
/** Root of the md-native memory layer: lessons.md / recipes.md / decisions.md. */
export function memoryRoot() {
    return join(dshHome(), "error-improvement", "memory");
}
export function memoryFile(kind) {
    return join(memoryRoot(), `${kind}.md`);
}
/** Pending user-confirmation drafts produced by distillation / graduation. */
export function draftsRoot() {
    return join(memoryRoot(), "drafts");
}
/** Append-only raw capture queue consumed by the distiller. */
export function candidatesFile() {
    return join(memoryRoot(), "candidates.jsonl");
}
export function skillsRoot() {
    return join(dshHome(), "skills");
}
export function legacySettingsYaml() {
    return join(dshHome(), "settings.yaml.imported");
}
export function legacyStateFile() {
    return join(dshHome(), "error-improvement", "state.json");
}
