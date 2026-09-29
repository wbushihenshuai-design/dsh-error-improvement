/**
 * Zero-LLM capture: observe the session event stream and queue durable
 * learning candidates (user corrections, repeated tool failures) into
 * candidates.jsonl for later distillation. Never blocks, never throws.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { PluginConfig } from "./config.js";
import { type ContentBlock } from "./lessons.js";
export interface Candidate {
    v: 1;
    ts: string;
    kind: "correction" | "repeat-error";
    cwd: string;
    origin: string;
    text: string;
    detail: string;
}
interface SessionHeaderLike {
    cwd?: string;
    origin?: string;
    delegationDepth?: number;
}
interface SessionLike {
    id?: string;
    header?: SessionHeaderLike;
}
interface SessionEventLike {
    type?: string;
    data?: {
        message?: {
            role?: string;
            content?: ContentBlock[] | string;
        };
        tool?: {
            name?: string;
        };
        name?: string;
        result?: {
            isError?: boolean;
            content?: ContentBlock[];
            error?: unknown;
        };
        isError?: boolean;
    };
}
export declare class CaptureRegistry {
    private readonly buffers;
    private keyOf;
    private bufferFor;
    observe(session: SessionLike, event: SessionEventLike): void;
    /** Build candidates for a finished turn; clears the session buffer. */
    finalize(session: SessionLike): Candidate[];
    drop(session: SessionLike): void;
}
export declare function appendCandidates(candidates: readonly Candidate[]): void;
/** Wire the capture registry into the harness session event stream. */
export declare function mountCapture(ctx: Context, getConfig: () => PluginConfig, registry: CaptureRegistry, onTurnSettled: (session: SessionLike, candidates: Candidate[]) => void): void;
export {};
