/**
 * Skill graduation: turn validated, repeatedly-helpful memory entries into
 * reusable agentskills.io SKILL.md files under $DSH_HOME/skills/<slug>/.
 *
 * Graduation is never silent: entries only reach the proposal stage via
 * runtime signals, and the SKILL.md file is written exclusively after the user
 * approves the corresponding draft in the confirmation UI.
 */
import { type MemoryEntry } from "./memory.js";
export declare function slugify(title: string): string;
export declare function renderSkill(entry: MemoryEntry): string;
export interface GraduateResult {
    ok: boolean;
    path?: string;
    message: string;
}
/**
 * Write the SKILL.md for an approved entry. Refuses to overwrite an existing
 * skill directory (never clobber hand-maintained skills).
 */
export declare function graduateEntry(entry: MemoryEntry): GraduateResult;
/** A graduation proposal is just a draft carrying the source entry. */
export declare function proposeGraduation(entry: MemoryEntry): MemoryEntry;
