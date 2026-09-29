/**
 * dsh-error-improvement — self-evolution entry point (v0.3.0, DSH 2.0.15+).
 *
 * Layers:
 *  - injection   agent/pre-step: relevant confirmed lessons/recipes into context
 *  - enforcement tools/*-execute: statistical interception of repeated errors
 *  - capture     session/event: zero-LLM candidate queue
 *  - signals     hit tracking → maturity → graduation proposals
 *  - distill     LLM Curator→Writer → drafts/ (user confirms each)
 *  - rpc/tools   drafts review for the settings page and the agent
 *
 * Every layer fails open; nothing reaches memory without the confirmation gate.
 */
import type { Context } from "@deepseek-ai/cordis";
import { Config } from "./config.js";
export declare const name = "dsh-error-improvement";
export { Config };
export declare const inject: string[];
export declare function apply(ctx: Context, config: unknown): void;
