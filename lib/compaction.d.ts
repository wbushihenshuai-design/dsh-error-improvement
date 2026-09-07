/**
 * Live-configured wrapper around DSH's durable basic compaction engine.
 *
 * The upstream engine owns range selection, tool-pair balancing, append-only
 * session mutations, overflow retries, and persistence checkpoints. This
 * wrapper supplies each asynchronous operation with an immutable settings
 * snapshot and retries a failed configured summarizer through a known route.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CompactionResult, CompactionTrigger } from "@deepseek-ai/dsh-compaction";
import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import type { ContentBlock, Message, TokenUsage, ToolSchema } from "@deepseek-ai/dsh-llm";
import type { SessionSeq } from "@deepseek-ai/dsh-session";
import type { ErrorImprovementSettings } from "./lessons.js";
interface SummarizationInput {
    readonly system?: string;
    readonly tools?: readonly ToolSchema[];
    readonly messages: readonly Message[];
}
type SummaryResult = {
    summary: ContentBlock[];
    provider: string;
    model: string;
    maxTokens?: number;
    usage?: TokenUsage;
} & ({
    rawOutput: ContentBlock[];
    llmStreamCall: true;
} | {
    rawOutput?: ContentBlock[];
    llmStreamCall?: never;
});
/**
 * A durable compaction backend whose policy is read from the current settings
 * source instead of immutable load-time plugin configuration.
 */
export declare class ConfigurableCompactionEngine extends BasicCompactionEngine {
    #private;
    /** Live settings getter installed by the host settings service. */
    readonly getSettings: () => ErrorImprovementSettings;
    constructor(ctx: Context, getSettings: () => ErrorImprovementSettings);
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
    compactRegion(start: SessionSeq, end: SessionSeq, agent: Agent, signal?: AbortSignal): Promise<CompactionResult>;
    compactNow(agent: Agent, signal: AbortSignal, sourceCommandId?: Parameters<BasicCompactionEngine["compactNow"]>[2]): Promise<CompactionResult | null>;
    /** Retry one failed configured summary through the safe configured fallback. */
    protected summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult>;
}
export type { CompactionResult };
