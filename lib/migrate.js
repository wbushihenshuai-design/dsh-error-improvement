/**
 * One-shot migration of pre-v0.3.0 data into the md-native memory layer:
 *  - settings.yaml.imported `error-improvement.lessons[]`  → memory/lessons.md
 *  - state.json v1 `recipes[]`                              → memory/recipes.md
 * Also seeds the built-in starter lesson on a fresh install.
 * Idempotent via flags in the state store.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { newEntry, readEntries, upsertEntry, writeEntriesAtomic, } from "./memory.js";
import { legacySettingsYaml, memoryFile } from "./paths.js";
const BUILTIN_LESSON = {
    ...newEntry("lesson", "builtin"),
    title: "Never blind-retry a failing tool call",
    mistake: "Repeating an identical tool call after it failed, wasting turns and sometimes corrupting state.",
    prevention: "When a tool call errors, do not retry it unchanged. Read the error, adjust arguments or approach, and only then call again.",
    appliesWhen: "any tool call that returned an error",
    keywords: "tool error retry loop failure",
    confirmed: true,
    enabled: true,
    maturity: "core",
    attributedTo: "builtin",
};
export function seedBuiltinLesson(logger) {
    const file = memoryFile("lessons");
    if (existsSync(file))
        return;
    const entry = newEntry("lesson", "lesson-builtin-no-blind-retry");
    Object.assign(entry, BUILTIN_LESSON, {
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    });
    writeEntriesAtomic(file, "lesson", [entry]);
    logger?.info("dsh-error-improvement: seeded built-in starter lesson");
}
function migrateLegacySettings(store, logger) {
    if (store.data.migrated.settingsYaml)
        return;
    const path = legacySettingsYaml();
    if (!existsSync(path)) {
        store.data.migrated.settingsYaml = true;
        return;
    }
    try {
        const parsed = parseYaml(readFileSync(path, "utf8"));
        const section = parsed?.["error-improvement"];
        const lessons = Array.isArray(section?.lessons)
            ? section.lessons
            : [];
        let imported = 0;
        for (const raw of lessons) {
            const title = (raw.title ?? "").trim();
            const prevention = (raw.prevention ?? "").trim();
            if (!title || !prevention)
                continue;
            const entry = newEntry("lesson", (raw.id ?? "").trim() || `lesson-legacy-${imported + 1}`);
            entry.title = title.slice(0, 300);
            entry.appliesWhen = (raw.scope ?? "").slice(0, 500);
            entry.mistake = (raw.mistake ?? "").slice(0, 1000);
            entry.prevention = prevention.slice(0, 1000);
            entry.keywords = (raw.keywords ?? "").slice(0, 500);
            entry.confirmed = raw.confirmed !== false;
            entry.enabled = raw.enabled !== false;
            entry.maturity = "validated";
            entry.attributedTo = "migration:settings.yaml";
            upsertEntry(memoryFile("lessons"), "lesson", entry);
            imported += 1;
        }
        store.data.migrated.settingsYaml = true;
        logger.info(`dsh-error-improvement: migrated ${imported} lesson(s) from settings.yaml.imported`);
    }
    catch (error) {
        logger.warn(`dsh-error-improvement: settings.yaml migration failed open: ${String(error)}`);
    }
}
function migrateLegacyRecipes(store, logger) {
    if (store.data.migrated.stateRecipes)
        return;
    const recipes = store.legacyRecipes;
    let imported = 0;
    for (const raw of recipes) {
        const title = (raw.title ?? "").trim();
        const solution = (raw.solution ?? "").trim();
        if (!title || !solution)
            continue;
        const entry = newEntry("recipe", (raw.id ?? "").trim() || `recipe-legacy-${imported + 1}`);
        entry.title = title.slice(0, 300);
        entry.problem = (raw.problem ?? "").slice(0, 1000);
        entry.solution = solution.slice(0, 4000);
        entry.appliesWhen = (raw.scope ?? "").slice(0, 500);
        entry.keywords = (raw.keywords ?? "").slice(0, 500);
        entry.confirmed = raw.confirmed !== false;
        entry.enabled = raw.enabled !== false;
        entry.maturity = "validated";
        entry.attributedTo = "migration:state.json";
        upsertEntry(memoryFile("recipes"), "recipe", entry);
        imported += 1;
    }
    store.legacyRecipes = [];
    store.data.migrated.stateRecipes = true;
    if (imported > 0) {
        logger.info(`dsh-error-improvement: migrated ${imported} recipe(s) from legacy state.json`);
    }
}
export function runMigration(store, logger) {
    seedBuiltinLesson(logger);
    migrateLegacySettings(store, logger);
    migrateLegacyRecipes(store, logger);
    store.flush();
    // Sanity: memory files must at least exist for the injection layer.
    readEntries(memoryFile("lessons"), "lesson");
}
