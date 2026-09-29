/**
 * Skill graduation: turn validated, repeatedly-helpful memory entries into
 * reusable agentskills.io SKILL.md files under $DSH_HOME/skills/<slug>/.
 *
 * Graduation is never silent: entries only reach the proposal stage via
 * runtime signals, and the SKILL.md file is written exclusively after the user
 * approves the corresponding draft in the confirmation UI.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type MemoryEntry, newEntryId, updateEntries } from "./memory.js";
import { memoryFile, skillsRoot } from "./paths.js";

export function slugify(title: string): string {
	const slug = title
		.normalize("NFKD")
		.replace(/[̀-ͯ]/gu, "")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9一-鿿]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 64);
	return slug || "unnamed-skill";
}

function frontmatterValue(value: string): string {
	return value.replace(/"/gu, "'").replace(/\r?\n/gu, " ").trim();
}

export function renderSkill(entry: MemoryEntry): string {
	const description = (entry.problem || entry.mistake || entry.title).slice(
		0,
		1024,
	);
	const body = entry.kind === "recipe" ? entry.solution : entry.prevention;
	const when = entry.appliesWhen || entry.keywords || "see keywords";
	return `---
name: ${slugify(entry.title)}
description: ${frontmatterValue(`${entry.title}. Use when: ${description.slice(0, 800)}`)}
---

# ${entry.title}

<!-- graduated from dsh-error-improvement entry ${entry.id} (${entry.hits} confirmed reuse hit(s)); source of truth: $DSH_HOME/error-improvement/memory -->

## When to use

${when}

## Proven approach

${body}
`;
}

export interface GraduateResult {
	ok: boolean;
	path?: string;
	message: string;
}

/**
 * Write the SKILL.md for an approved entry. Refuses to overwrite an existing
 * skill directory (never clobber hand-maintained skills).
 */
export function graduateEntry(entry: MemoryEntry): GraduateResult {
	const slug = slugify(entry.title);
	const directory = join(skillsRoot(), slug);
	const path = join(directory, "SKILL.md");
	if (existsSync(path)) {
		return {
			ok: false,
			message: `Refused to overwrite existing skill at ${path}; rename the entry title or remove the directory first.`,
		};
	}
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(path, renderSkill(entry), "utf8");
	} catch (error) {
		return { ok: false, message: `Failed to write skill: ${String(error)}` };
	}
	// Mark the source entry as graduated (core maturity + provenance).
	const file =
		entry.kind === "recipe" ? memoryFile("recipes") : memoryFile("lessons");
	updateEntries(file, entry.kind, (candidate) => {
		if (candidate.id !== entry.id) return candidate;
		candidate.maturity = "core";
		candidate.evidence = `${candidate.evidence} | skill: ${path}`
			.trim()
			.slice(0, 400);
		candidate.updatedAt = new Date().toISOString();
		return candidate;
	});
	return { ok: true, path, message: `Skill written to ${path}` };
}

/** A graduation proposal is just a draft carrying the source entry. */
export function proposeGraduation(entry: MemoryEntry): MemoryEntry {
	const proposal: MemoryEntry = {
		...entry,
		id: newEntryId("graduate"),
		supersedes: "",
		confirmed: false,
		attributedTo: `graduation-proposal:${entry.id}`,
		updatedAt: new Date().toISOString(),
	};
	return proposal;
}
