/**
 * Persistent runtime state (JSON): error statistics, promoted guard rules,
 * distillation watermarks and one-time migration flags.
 *
 * Version 2 drops the embedded `recipes` list — recipes now live in the
 * md-native memory layer. Recipes found in a legacy v1 state file are kept in
 * the transient `legacyRecipes` field until migrate.ts moves them over.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { legacyStateFile } from "./paths.js";

export interface ErrorRecord {
	tool: string;
	argsHint: string;
	count: number;
	firstAt: number;
	lastAt: number;
	sample: string;
}

export interface Promotion {
	signature: string;
	tool: string;
	argsHint: string;
	lessonId?: string;
	mode: "warn" | "deny";
	reason: string;
	count: number;
	promotedAt: number;
	warnedAt?: number;
}

/** Legacy v1 shape kept only for migration. */
export interface RuntimeRecipe {
	id: string;
	title: string;
	problem: string;
	solution: string;
	scope: string;
	keywords: string;
	confirmed: boolean;
	enabled: boolean;
	createdAt: string;
}

export interface DistillState {
	/** Byte offset into candidates.jsonl already processed. */
	watermark: number;
	lastRunAt: number;
}

export interface MigrationFlags {
	settingsYaml: boolean;
	stateRecipes: boolean;
}

export interface ImprovementState {
	version: 2;
	errors: Record<string, ErrorRecord>;
	promotions: Promotion[];
	distill: DistillState;
	migrated: MigrationFlags;
}

export function normalizeText(value: string, max = 120): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[0-9a-f]{8,}/gu, "#")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, max);
}

export function errorSignature(tool: string, sample: string): string {
	return `${tool}|${normalizeText(sample, 80)}`;
}

function emptyState(): ImprovementState {
	return {
		version: 2,
		errors: {},
		promotions: [],
		distill: { watermark: 0, lastRunAt: 0 },
		migrated: { settingsYaml: false, stateRecipes: false },
	};
}

interface LegacyStateV1 {
	version?: number;
	errors?: Record<string, ErrorRecord>;
	promotions?: Promotion[];
	recipes?: RuntimeRecipe[];
}

export class ImprovementStore {
	readonly path: string;
	private state: ImprovementState;
	/** Transient: recipes recovered from a v1 file, consumed by migrate.ts. */
	legacyRecipes: RuntimeRecipe[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(path = legacyStateFile()) {
		this.path = path;
		this.state = this.load();
	}

	private load(): ImprovementState {
		try {
			if (!existsSync(this.path)) return emptyState();
			const raw = JSON.parse(readFileSync(this.path, "utf8")) as LegacyStateV1;
			const state = emptyState();
			if (raw && typeof raw === "object") {
				if (raw.errors && typeof raw.errors === "object")
					state.errors = raw.errors;
				if (Array.isArray(raw.promotions)) state.promotions = raw.promotions;
				const distill = (raw as { distill?: DistillState }).distill;
				if (distill && typeof distill === "object") {
					if (Number.isFinite(distill.watermark))
						state.distill.watermark = distill.watermark;
					if (Number.isFinite(distill.lastRunAt))
						state.distill.lastRunAt = distill.lastRunAt;
				}
				const migrated = (raw as { migrated?: MigrationFlags }).migrated;
				if (migrated && typeof migrated === "object") {
					state.migrated.settingsYaml = migrated.settingsYaml === true;
					state.migrated.stateRecipes = migrated.stateRecipes === true;
				}
				if ((raw.version ?? 1) < 2 && Array.isArray(raw.recipes)) {
					this.legacyRecipes = raw.recipes;
				}
			}
			return state;
		} catch {
			// fail-open: a corrupt state file must never block plugin boot
			return emptyState();
		}
	}

	get data(): ImprovementState {
		return this.state;
	}

	flush(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			const tmp = `${this.path}.tmp-${process.pid}`;
			writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
			renameSync(tmp, this.path);
		} catch {
			// fail-open
		}
	}

	scheduleSave(): void {
		if (this.timer) return;
		this.timer = setTimeout(() => this.flush(), 250);
		if (
			typeof this.timer === "object" &&
			typeof this.timer.unref === "function"
		) {
			this.timer.unref();
		}
	}

	recordError(
		tool: string,
		argsHint: string,
		sample: string,
	): { signature: string; record: ErrorRecord } {
		const signature = errorSignature(tool, sample);
		const now = Date.now();
		const existing = this.state.errors[signature];
		if (existing) {
			existing.count += 1;
			existing.lastAt = now;
			existing.sample = sample.slice(0, 300);
			this.scheduleSave();
			return { signature, record: existing };
		}
		const record: ErrorRecord = {
			tool,
			argsHint,
			count: 1,
			firstAt: now,
			lastAt: now,
			sample: sample.slice(0, 300),
		};
		this.state.errors[signature] = record;
		this.scheduleSave();
		return { signature, record };
	}

	findPromotion(signature: string): Promotion | undefined {
		return this.state.promotions.find((rule) => rule.signature === signature);
	}

	promote(rule: Omit<Promotion, "promotedAt">, maxRules: number): Promotion {
		const existing = this.findPromotion(rule.signature);
		if (existing) return existing;
		const promotion: Promotion = { ...rule, promotedAt: Date.now() };
		this.state.promotions.push(promotion);
		// Evict oldest auto-rules (those not linked to a memory lesson) beyond the cap.
		const auto = this.state.promotions.filter(
			(candidate) => !candidate.lessonId,
		);
		const overflow = this.state.promotions.length - Math.max(1, maxRules);
		if (overflow > 0) {
			const evict = new Set(
				auto
					.slice()
					.sort((left, right) => left.promotedAt - right.promotedAt)
					.slice(0, overflow)
					.map((candidate) => candidate.signature),
			);
			this.state.promotions = this.state.promotions.filter(
				(candidate) => !evict.has(candidate.signature),
			);
		}
		this.scheduleSave();
		return promotion;
	}

	markWarned(signature: string): void {
		const promotion = this.findPromotion(signature);
		if (!promotion) return;
		promotion.warnedAt = Date.now();
		this.scheduleSave();
	}
}
