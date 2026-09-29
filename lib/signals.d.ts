/**
 * Runtime signals: track how often injected entries actually helped.
 *
 * Heuristic (v0.3.0, deliberately coarse): entries presented during a turn earn
 * one hit when the turn completes with at least one successful tool result and
 * no newly promoted guard rule (i.e. nothing regressed). Hits drive maturity
 * (draft → validated → core) and skill graduation proposals.
 */
import { type MemoryEntry } from "./memory.js";
export interface TurnSignals {
    presentedIds: Set<string>;
    successfulTools: number;
    failedTools: number;
    newPromotions: number;
}
export declare function newTurnSignals(): TurnSignals;
/** In-flight signals keyed by session; dropped when the session disposes. */
export declare class SignalsRegistry {
    private readonly turns;
    get(sessionKey: string): TurnSignals;
    present(sessionKey: string, ids: readonly string[]): void;
    drop(sessionKey: string): TurnSignals | undefined;
}
export interface GraduationCandidate {
    entry: MemoryEntry;
    path: string;
}
/**
 * Settle one finished turn: bump hits for presented entries that helped and
 * return entries newly eligible for skill graduation.
 */
export declare function settleTurn(signals: TurnSignals, minGraduationHits: number, now?: Date): {
    updated: MemoryEntry[];
    graduatable: GraduationCandidate[];
};
