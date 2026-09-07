/**
 * Live-configured wrapper around DSH's durable basic compaction engine.
 *
 * The upstream engine owns range selection, tool-pair balancing, append-only
 * session mutations, overflow retries, and persistence checkpoints. This
 * wrapper supplies each asynchronous operation with an immutable settings
 * snapshot and retries a failed configured summarizer through a known route.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {
	CompactionResult,
	CompactionTrigger,
} from "@deepseek-ai/dsh-compaction";
import {
	type BasicCompactionConfig,
	BasicCompactionEngine,
	type ResolvedConfig,
} from "@deepseek-ai/dsh-compaction-basic";
import type {
	ContentBlock,
	Message,
	TokenUsage,
	ToolSchema,
} from "@deepseek-ai/dsh-llm";
import type { SessionSeq } from "@deepseek-ai/dsh-session";

import type { ErrorImprovementSettings } from "./lessons.js";

const DEFAULT_THRESHOLD_RATIO = 0.8;
const DEFAULT_RETAIN_RATIO = 0.16;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_COMPACTION_RETRIES = 1;
const DEFAULT_OVERFLOW_RETRIES = 1;

interface SummaryRoute {
	provider: string;
	model: string;
}

interface LiveCompactionSettings {
	enabled: boolean;
	thresholdRatio: number;
	retainRatio: number;
	maxTokens: number;
	primary?: SummaryRoute;
	fallback?: SummaryRoute;
}

interface CompactionOperation {
	config: ResolvedConfig;
	settings: LiveCompactionSettings;
	fallback?: SummaryRoute;
}

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
} & (
	| { rawOutput: ContentBlock[]; llmStreamCall: true }
	| { rawOutput?: ContentBlock[]; llmStreamCall?: never }
);

function routeFromPair(
	label: string,
	provider: string | undefined,
	model: string | undefined,
): SummaryRoute | undefined {
	const normalizedProvider = provider?.trim() ?? "";
	const normalizedModel = model?.trim() ?? "";
	if (normalizedProvider.length === 0 && normalizedModel.length === 0)
		return undefined;
	if (normalizedProvider.length === 0 || normalizedModel.length === 0) {
		throw new Error(
			`${label} provider and model must be configured together or both left blank`,
		);
	}
	return { provider: normalizedProvider, model: normalizedModel };
}

function sameRoute(
	left: SummaryRoute | undefined,
	right: SummaryRoute | undefined,
): boolean {
	return (
		left !== undefined &&
		right !== undefined &&
		left.provider === right.provider &&
		left.model === right.model
	);
}

function conversationRoute(agent: Agent): SummaryRoute | undefined {
	const routed = agent.session.requestHeader()?.config;
	if (
		routed !== undefined &&
		routed.provider.length > 0 &&
		routed.model.length > 0
	) {
		return { provider: routed.provider, model: routed.model };
	}
	return routeFromPair(
		"agent options",
		agent.options.provider,
		agent.options.model,
	);
}

function assertPolicy(settings: LiveCompactionSettings): void {
	if (
		!Number.isFinite(settings.thresholdRatio) ||
		settings.thresholdRatio <= 0 ||
		settings.thresholdRatio > 1
	) {
		throw new Error("compaction thresholdRatio must be a number in (0, 1]");
	}
	if (
		!Number.isFinite(settings.retainRatio) ||
		settings.retainRatio <= 0 ||
		settings.retainRatio >= settings.thresholdRatio
	) {
		throw new Error(
			"compaction retainRatio must be positive and lower than thresholdRatio",
		);
	}
	if (!Number.isInteger(settings.maxTokens) || settings.maxTokens <= 0) {
		throw new Error("compaction maxTokens must be a positive integer");
	}
}

function toBasicConfig(
	settings: LiveCompactionSettings,
	route: SummaryRoute | undefined,
	auto: boolean,
): BasicCompactionConfig {
	return {
		thresholdRatio: settings.thresholdRatio,
		retainRatio: settings.retainRatio,
		summarizationProvider: route?.provider ?? "",
		summarizationModel: route?.model ?? "",
		maxTokens: settings.maxTokens,
		compactionRetries: DEFAULT_COMPACTION_RETRIES,
		maxOverflowRetries: DEFAULT_OVERFLOW_RETRIES,
		modelPolicies: [],
		auto,
	};
}

function toResolvedConfig(
	settings: LiveCompactionSettings,
	route: SummaryRoute | undefined,
): ResolvedConfig {
	return Object.freeze({
		thresholdRatio: settings.thresholdRatio,
		retainRatio: settings.retainRatio,
		summarizationProvider: route?.provider ?? "",
		summarizationModel: route?.model ?? "",
		maxTokens: settings.maxTokens,
		compactionRetries: DEFAULT_COMPACTION_RETRIES,
		maxOverflowRetries: DEFAULT_OVERFLOW_RETRIES,
		modelPolicies: Object.freeze([]),
		auto: true,
	});
}

/**
 * A durable compaction backend whose policy is read from the current settings
 * source instead of immutable load-time plugin configuration.
 */
export class ConfigurableCompactionEngine extends BasicCompactionEngine {
	/** Live settings getter installed by the host settings service. */
	readonly getSettings: () => ErrorImprovementSettings;
	readonly #operations = new AsyncLocalStorage<CompactionOperation>();
	readonly #defaultConfig: ResolvedConfig;

	constructor(ctx: Context, getSettings: () => ErrorImprovementSettings) {
		const defaults: LiveCompactionSettings = {
			enabled: true,
			thresholdRatio: DEFAULT_THRESHOLD_RATIO,
			retainRatio: DEFAULT_RETAIN_RATIO,
			maxTokens: DEFAULT_MAX_TOKENS,
		};
		super(ctx, toBasicConfig(defaults, undefined, true));
		this.getSettings = getSettings;
		this.#defaultConfig = this.config;

		// The base engine reads `this.config` throughout asynchronous calls. The
		// proxy resolves its fields from the async operation that started the call,
		// so simultaneous sessions cannot overwrite one another's policy snapshot.
		const engine = this as unknown as { config: ResolvedConfig };
		engine.config = new Proxy(this.#defaultConfig, {
			get: (_target, key, receiver) =>
				Reflect.get(
					this.#operations.getStore()?.config ?? this.#defaultConfig,
					key,
					receiver,
				),
		}) as ResolvedConfig;
	}

	override compactIfNeeded(
		agent: Agent,
		trigger: CompactionTrigger,
		signal: AbortSignal,
	): Promise<CompactionResult | null> {
		if (this.#operations.getStore() !== undefined)
			return super.compactIfNeeded(agent, trigger, signal);
		const settings = this.#settings();
		if (!settings.enabled) return Promise.resolve(null);
		return this.#runOperation(settings, agent, () =>
			super.compactIfNeeded(agent, trigger, signal),
		);
	}

	override compactRegion(
		start: SessionSeq,
		end: SessionSeq,
		agent: Agent,
		signal?: AbortSignal,
	): Promise<CompactionResult> {
		if (this.#operations.getStore() !== undefined)
			return super.compactRegion(start, end, agent, signal);
		return this.#runOperation(this.#settings(), agent, () =>
			super.compactRegion(start, end, agent, signal),
		);
	}

	override compactNow(
		agent: Agent,
		signal: AbortSignal,
		sourceCommandId?: Parameters<BasicCompactionEngine["compactNow"]>[2],
	): Promise<CompactionResult | null> {
		if (this.#operations.getStore() !== undefined)
			return super.compactNow(agent, signal, sourceCommandId);
		const settings = this.#settings();
		return this.#runOperation(settings, agent, () =>
			super.compactNow(agent, signal, sourceCommandId),
		);
	}

	/** Retry one failed configured summary through the safe configured fallback. */
	protected override async summarize(
		input: SummarizationInput,
		agent: Agent,
		signal?: AbortSignal,
	): Promise<SummaryResult> {
		const operation = this.#operations.getStore();
		if (operation === undefined) return super.summarize(input, agent, signal);
		const initial = operation.settings.primary ?? conversationRoute(agent);
		try {
			return await super.summarize(input, agent, signal);
		} catch (error) {
			if (
				signal?.aborted ||
				operation.fallback === undefined ||
				sameRoute(initial, operation.fallback)
			) {
				throw error;
			}
			this.ctx.logger.warn(
				`compaction summarizer ${initial?.provider ?? "conversation"}/${initial?.model ?? "model"} failed; retrying with ${operation.fallback.provider}/${operation.fallback.model}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return this.#operations.run(
				{
					...operation,
					config: toResolvedConfig(operation.settings, operation.fallback),
				},
				() => super.summarize(input, agent, signal),
			);
		}
	}

	#settings(): LiveCompactionSettings {
		const compaction = this.getSettings().compaction;
		const settings: LiveCompactionSettings = {
			enabled: compaction?.enabled !== false,
			thresholdRatio: compaction?.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO,
			retainRatio: compaction?.retainRatio ?? DEFAULT_RETAIN_RATIO,
			maxTokens: compaction?.maxTokens ?? DEFAULT_MAX_TOKENS,
			primary: routeFromPair(
				"primary compaction route",
				compaction?.summarizationProvider,
				compaction?.summarizationModel,
			),
			fallback: routeFromPair(
				"fallback compaction route",
				compaction?.fallbackSummarizationProvider,
				compaction?.fallbackSummarizationModel,
			),
		};
		assertPolicy(settings);
		return settings;
	}

	#runOperation<T>(
		settings: LiveCompactionSettings,
		agent: Agent,
		run: () => Promise<T>,
	): Promise<T> {
		const fallback =
			settings.fallback ??
			(settings.primary === undefined ? undefined : conversationRoute(agent));
		return this.#operations.run(
			{
				config: toResolvedConfig(settings, settings.primary),
				settings,
				fallback,
			},
			run,
		);
	}
}

export type { CompactionResult };
