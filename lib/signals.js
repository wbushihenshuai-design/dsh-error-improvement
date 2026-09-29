/**
 * Runtime signals: track how often injected entries actually helped.
 *
 * Heuristic (v0.3.0, deliberately coarse): entries presented during a turn earn
 * one hit when the turn completes with at least one successful tool result and
 * no newly promoted guard rule (i.e. nothing regressed). Hits drive maturity
 * (draft → validated → core) and skill graduation proposals.
 */
import { readEntries, updateEntries, } from "./memory.js";
import { memoryFile } from "./paths.js";
const VALIDATED_HITS = 2;
const CORE_HITS = 5;
export function newTurnSignals() {
    return {
        presentedIds: new Set(),
        successfulTools: 0,
        failedTools: 0,
        newPromotions: 0,
    };
}
/** In-flight signals keyed by session; dropped when the session disposes. */
export class SignalsRegistry {
    turns = new Map();
    get(sessionKey) {
        let signals = this.turns.get(sessionKey);
        if (!signals) {
            signals = newTurnSignals();
            this.turns.set(sessionKey, signals);
        }
        return signals;
    }
    present(sessionKey, ids) {
        const signals = this.get(sessionKey);
        for (const id of ids)
            signals.presentedIds.add(id);
    }
    drop(sessionKey) {
        const signals = this.turns.get(sessionKey);
        this.turns.delete(sessionKey);
        return signals;
    }
}
/**
 * Settle one finished turn: bump hits for presented entries that helped and
 * return entries newly eligible for skill graduation.
 */
export function settleTurn(signals, minGraduationHits, now = new Date()) {
    if (signals.presentedIds.size === 0)
        return { updated: [], graduatable: [] };
    const helped = signals.successfulTools > 0 &&
        signals.newPromotions === 0 &&
        signals.failedTools <= signals.successfulTools;
    if (!helped)
        return { updated: [], graduatable: [] };
    const graduatable = [];
    const updated = [];
    for (const [kind, file] of [
        ["lesson", memoryFile("lessons")],
        ["recipe", memoryFile("recipes")],
    ]) {
        const known = new Map(readEntries(file, kind).map((entry) => [entry.id, entry]));
        const targets = [...signals.presentedIds].filter((id) => known.has(id));
        if (targets.length === 0)
            continue;
        const changed = updateEntries(file, kind, (entry) => {
            if (!signals.presentedIds.has(entry.id))
                return entry;
            entry.hits += 1;
            entry.lastHitAt = now.toISOString();
            entry.updatedAt = now.toISOString();
            if (entry.maturity === "draft" && entry.hits >= VALIDATED_HITS) {
                entry.maturity = "validated";
            }
            if (entry.maturity === "validated" && entry.hits >= CORE_HITS) {
                entry.maturity = "core";
            }
            updated.push({ ...entry });
            return entry;
        });
        for (const entry of changed) {
            if (signals.presentedIds.has(entry.id) &&
                entry.hits >= minGraduationHits &&
                (entry.maturity === "validated" || entry.maturity === "core")) {
                graduatable.push({ entry: { ...entry }, path: file });
            }
        }
    }
    return { updated, graduatable };
}
