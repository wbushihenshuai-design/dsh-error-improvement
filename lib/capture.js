/**
 * Zero-LLM capture: observe the session event stream and queue durable
 * learning candidates (user corrections, repeated tool failures) into
 * candidates.jsonl for later distillation. Never blocks, never throws.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { blocksToText } from "./lessons.js";
import { candidatesFile } from "./paths.js";
/** CJK + English phrases that mark a user message as a correction. */
const CORRECTION_RE = /^[\s(（]*(?:不对|错了|不是这样|不是这个|别这样|不要这样|停下来|重来|重新来|你应该|你应当|我说过|我不是说|记住|以后别|以后不要|no[,.! ]|wrong|that's not|dont|don't|stop[,.! ]|remember[,: ]|i told you)/iu;
const MAX_TEXT = 2000;
const MAX_BUFFERED = 40;
export class CaptureRegistry {
    buffers = new Map();
    keyOf(session) {
        return session.id ?? `anon-${Math.random().toString(36).slice(2)}`;
    }
    bufferFor(session) {
        const key = this.keyOf(session);
        let buffer = this.buffers.get(key);
        if (!buffer) {
            // Subagents never capture: the parent turn owns memory handling.
            const depth = session.header?.delegationDepth ?? 0;
            buffer = {
                userCorrections: [],
                toolErrors: new Map(),
                lastAssistant: "",
                cwd: session.header?.cwd ?? "",
                origin: session.header?.origin ?? "",
                eligible: depth === 0,
            };
            this.buffers.set(key, buffer);
        }
        return buffer;
    }
    observe(session, event) {
        const buffer = this.bufferFor(session);
        if (!buffer || !buffer.eligible)
            return;
        const type = event.type ?? "";
        if (type === "user/message") {
            const content = event.data?.message?.content;
            const text = typeof content === "string" ? content : blocksToText(content);
            if (text && CORRECTION_RE.test(text)) {
                if (buffer.userCorrections.length < MAX_BUFFERED) {
                    buffer.userCorrections.push(text.slice(0, MAX_TEXT));
                }
            }
        }
        else if (type === "assistant/message") {
            const content = event.data?.message?.content;
            const text = typeof content === "string" ? content : blocksToText(content);
            if (text)
                buffer.lastAssistant = text.slice(0, MAX_TEXT);
        }
        else if (type === "tool/result") {
            const result = event.data?.result;
            const isError = result?.isError === true || event.data?.isError === true;
            if (!isError)
                return;
            const name = (typeof event.data?.tool?.name === "string" && event.data.tool.name) ||
                (typeof event.data?.name === "string" ? event.data.name : "");
            const sample = result
                ? blocksToText(result.content).slice(0, 300) ||
                    (result.error instanceof Error ? result.error.message : "")
                : "";
            const key = `${name}|${sample.slice(0, 80)}`;
            const existing = buffer.toolErrors.get(key);
            if (existing)
                existing.count += 1;
            else if (buffer.toolErrors.size < MAX_BUFFERED) {
                buffer.toolErrors.set(key, { name, sample, count: 1 });
            }
        }
    }
    /** Build candidates for a finished turn; clears the session buffer. */
    finalize(session) {
        const key = this.keyOf(session);
        const buffer = this.buffers.get(key);
        this.buffers.delete(key);
        if (!buffer || !buffer.eligible)
            return [];
        const ts = new Date().toISOString();
        const candidates = [];
        for (const text of buffer.userCorrections) {
            candidates.push({
                v: 1,
                ts,
                kind: "correction",
                cwd: buffer.cwd,
                origin: buffer.origin,
                text,
                detail: buffer.lastAssistant
                    ? `assistant context: ${buffer.lastAssistant.slice(0, 400)}`
                    : "",
            });
        }
        for (const error of buffer.toolErrors.values()) {
            if (error.count < 2)
                continue;
            candidates.push({
                v: 1,
                ts,
                kind: "repeat-error",
                cwd: buffer.cwd,
                origin: buffer.origin,
                text: `Tool ${error.name} failed ${error.count} times in one turn: ${error.sample.slice(0, 300)}`,
                detail: "",
            });
        }
        return candidates.slice(0, MAX_BUFFERED);
    }
    drop(session) {
        this.buffers.delete(this.keyOf(session));
    }
}
export function appendCandidates(candidates) {
    if (candidates.length === 0)
        return;
    const file = candidatesFile();
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`, "utf8");
}
/** Wire the capture registry into the harness session event stream. */
export function mountCapture(ctx, getConfig, registry, onTurnSettled) {
    const events = ctx;
    events.on("session/event", (session, event) => {
        try {
            if (getConfig().capture.enabled === false)
                return;
            registry.observe(session, event);
        }
        catch (error) {
            ctx.logger.warn(`dsh-error-improvement: capture failed open: ${String(error)}`);
        }
    });
    events.on("agent/turn-stopping", async (payload, next) => {
        const result = await next();
        try {
            const session = payload.agent?.session;
            if (session && getConfig().capture.enabled !== false) {
                onTurnSettled(session, registry.finalize(session));
            }
        }
        catch (error) {
            ctx.logger.warn(`dsh-error-improvement: capture finalize failed open: ${String(error)}`);
        }
        return result;
    });
    events.on("session/disposed", (session) => {
        try {
            registry.drop(session);
        }
        catch {
            // fail-open
        }
    });
}
