/** Persistent runtime state: error counters, promoted rules, success recipes. */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

export interface RuntimeRecipe {
	id: string;
	title: string;
	problem: string;
	solution: string;
	scope: string;
	keywords: string;
	confirmed: boolean;
	enabled: boolean;
	createdAt: number;
}

export interface ImprovementState {
	version: 1;
	errors: Record<string, ErrorRecord>;
	promotions: Promotion[];
	recipes: RuntimeRecipe[];
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

export function defaultStatePath(): string {
	const env = process.env.DSH_HOME;
	const home = env?.trim() ? env : join(homedir(), ".dsh");
	return join(home, "error-improvement", "state.json");
}

function emptyState(): ImprovementState {
	return { version: 1, errors: {}, promotions: [], recipes: [] };
}

export class ImprovementStore {
	readonly path: string;
	private state: ImprovementState = emptyState();
	private dirty = false;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(path = defaultStatePath()) {
		this.path = path;
		this.load();
	}

	get data(): Readonly<ImprovementState> {
		return this.state;
	}

	private load(): void {
		try {
			if (!existsSync(this.path)) return;
			const parsed = JSON.parse(
				readFileSync(this.path, "utf8"),
			) as Partial<ImprovementState>;
			if (!parsed || typeof parsed !== "object") return;
			this.state = {
				version: 1,
				errors:
					parsed.errors && typeof parsed.errors === "object"
						? parsed.errors
						: {},
				promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
				recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
			};
		} catch {
			// Fail-open: a corrupt state file must never break the host.
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
		const record: ErrorRecord = existing
			? {
					...existing,
					count: existing.count + 1,
					lastAt: now,
					sample: sample.slice(0, 300),
					argsHint: argsHint || existing.argsHint,
				}
			: {
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
		return this.state.promotions.find(
			(promotion) => promotion.signature === signature,
		);
	}

	promote(entry: Omit<Promotion, "promotedAt">, maxRules: number): Promotion {
		const existing = this.findPromotion(entry.signature);
		if (existing) return existing;
		const promotion: Promotion = { ...entry, promotedAt: Date.now() };
		this.state.promotions.push(promotion);
		// Evict oldest lesson-less auto-rules beyond the cap; lesson-linked
		// rules are user-curated knowledge and never auto-evicted.
		while (this.state.promotions.length > Math.max(1, maxRules)) {
			const index = this.state.promotions.findIndex(
				(candidate) => !candidate.lessonId,
			);
			if (index < 0) break;
			this.state.promotions.splice(index, 1);
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

	addRecipe(input: {
		title: string;
		problem: string;
		solution: string;
		scope?: string;
		keywords?: string;
	}): RuntimeRecipe {
		const now = Date.now();
		const id = `recipe-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const recipe: RuntimeRecipe = {
			id,
			title: input.title.slice(0, 300),
			problem: input.problem.slice(0, 2000),
			solution: input.solution.slice(0, 4000),
			scope: (input.scope ?? "").slice(0, 500),
			keywords: (input.keywords ?? "").slice(0, 1000),
			confirmed: true,
			enabled: true,
			createdAt: now,
		};
		this.state.recipes.push(recipe);
		this.scheduleSave();
		return recipe;
	}

	flush(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (!this.dirty) return;
		this.dirty = false;
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			const tmp = `${this.path}.tmp`;
			writeFileSync(tmp, JSON.stringify(this.state, null, 2));
			renameSync(tmp, this.path);
		} catch {
			// Fail-open: persistence problems must never break the host.
		}
	}

	private scheduleSave(): void {
		this.dirty = true;
		if (this.timer) return;
		this.timer = setTimeout(() => this.flush(), 250);
		this.timer.unref?.();
	}
}
