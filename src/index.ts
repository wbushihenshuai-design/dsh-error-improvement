/** Standalone DSH host plugin for user-confirmed anti-regression lessons. */

import type { Context } from "@deepseek-ai/cordis";
import type { PreStepDecision } from "@deepseek-ai/dsh-agent";

import { ConfigurableCompactionEngine } from "./compaction.js";
import {
	builtinLessons,
	defaultSettings,
	type ErrorImprovementSettings,
	ErrorImprovementSettingsSchema,
	lessonMessage,
	PLUGIN_NAME,
	SETTINGS_NAMESPACE,
} from "./lessons.js";

export const name = PLUGIN_NAME;
// `compaction` must not be a module-level dependency: this plugin replaces the
// base implementation once it becomes available through the scoped callback.
export const inject = ["agents", "settings"];
export { ErrorImprovementSettingsSchema };
export type { ErrorImprovementSettings };

interface SettingsService {
	installSection: (
		owner: Context,
		namespace: string,
		schema: unknown,
		defaults: ErrorImprovementSettings,
		callbacks: {
			setSource: (current: () => ErrorImprovementSettings) => void;
			onChange: () => void;
		},
	) => void;
}

export function improveDecision(
	decision: PreStepDecision,
	step: number,
	aborted: boolean,
	settings: ErrorImprovementSettings,
): PreStepDecision {
	if (
		decision.kind === "reject" ||
		aborted ||
		step !== 1 ||
		decision.messages.length === 0
	) {
		return decision;
	}
	const message = lessonMessage(settings, decision.messages);
	if (!message) return decision;
	return { ...decision, messages: [...decision.messages, message] };
}

export function apply(ctx: Context): void {
	let currentSettings = (): ErrorImprovementSettings => defaultSettings;

	ctx.inject(["settings"], (settingsCtx) => {
		const settings = (settingsCtx as unknown as { settings: SettingsService })
			.settings;
		settings.installSection(
			ctx,
			SETTINGS_NAMESPACE,
			ErrorImprovementSettingsSchema,
			{ ...defaultSettings, lessons: [...builtinLessons] },
			{
				setSource: (source) => {
					currentSettings = source;
				},
				onChange: () => {},
			},
		);
	});

	ctx.on(
		"agent/pre-step",
		async ({ signal, step }, next): Promise<PreStepDecision> => {
			const decision = await next();
			try {
				return improveDecision(
					decision,
					step,
					signal.aborted,
					currentSettings(),
				);
			} catch (error) {
				ctx.logger.warn(
					`${PLUGIN_NAME}: lesson injection failed open: ${String(error)}`,
				);
				return decision;
			}
		},
		{ prepend: true },
	);

	// Web agents mount compaction inside preset-local realms, while the Web host
	// intentionally has no `compaction` service to wait for. Mount one host-level
	// engine once its actual dependencies are available; its global automatic
	// handlers compact the agent-owned sessions using the live plugin settings.
	ctx.inject(["llm", "tokenMeter", "sessions"], () => {
		try {
			new ConfigurableCompactionEngine(ctx, currentSettings);
			ctx.logger.info(`${PLUGIN_NAME}: configurable compaction engine mounted`);
		} catch (error) {
			ctx.logger.warn(
				`${PLUGIN_NAME}: compaction engine registration failed: ${String(error)}`,
			);
		}
	});

	ctx.logger.info(
		`${PLUGIN_NAME}: active; settings namespace=${SETTINGS_NAMESPACE}; compaction=on`,
	);
}
