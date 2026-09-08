window.__ModuleLoader__.load({
	id: "dsh-error-improvement",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		const React = require("react");
		const jsx = require("react/jsx-runtime");

		const NS = "error-improvement-ui";
		const SETTINGS_NS = "error-improvement";
		const defaults = {
			enabled: true,
			mode: "assist",
			maxLessons: 5,
			maxChars: 6000,
			lessons: [],
			compaction: {
				enabled: true,
				thresholdRatio: 0.8,
				retainRatio: 0.16,
				summarizationProvider: "",
				summarizationModel: "",
				fallbackSummarizationProvider: "",
				fallbackSummarizationModel: "",
				maxTokens: 8192,
			},
		};

		const zh = {
			nav: "错误改进",
			title: "错误改进与防重复犯错",
			description:
				"把你确认过的错误保存为任务前检查规则。插件只注入相关经验，不会自动执行操作，也不会连接外部服务。",
			enabled: "启用任务前经验提醒",
			mode: "匹配模式",
			assist: "相关匹配（推荐）",
			strict: "每次注入全部启用规则",
			maxLessons: "每次最多规则数（1–50）",
			maxChars: "经验上下文上限（500–50000 字符）",
			lessons: "经验规则",
			add: "添加规则",
			save: "保存更改",
			reset: "撤销未保存更改",
			remove: "删除",
			lessonEnabled: "启用此规则",
			confirmed: "我已确认这是正确的经验规则",
			titleLabel: "规则名称",
			mistake: "之前犯了什么错误",
			prevention: "以后必须如何避免",
			scope: "适用范围（可选）",
			keywords: "匹配关键词（可选，用空格或逗号分隔）",
			saved: "已保存；下一次新任务步骤生效。",
			savedWithEdits: "保存开始时的版本已写入；你在保存期间的新修改仍未保存。",
			saving: "正在保存…",
			conflict:
				"设置已在其他位置更新。你的草稿已保留；请检查后重新保存或撤销。",
			rejected: "设置没有写入，可能发生了版本冲突或校验失败。草稿已保留。",
			empty: "还没有规则。请从一个已经确认的真实错误开始添加。",
			unavailable: "错误改进 Host 尚未加载，当前不能保存。",
			readonly: "当前设置连接为只读。",
			incomplete: "每条规则必须填写“规则名称”和“以后必须如何避免”。",
			invalidNumber: "规则数或字符上限超出允许范围。",
			unsaved: "有未保存的更改。",
			error: "保存失败：{message}",
			compactionTitle: "压缩上下文",
			compactionEnabled: "启用自动压缩",
			compactionThreshold: "压缩触发阈值（上下文使用百分比）",
			compactionRetain: "压缩后保留最近比例",
			compactionModel: "主压缩摘要模型（留空=使用当前对话模型）",
			compactionFallbackModel:
				"备用摘要模型（主模型失败时使用；留空=当前对话模型）",
			compactionModelHint: "格式：provider/model，如 codexpp/gpt-5.6-sol",
			compactionMaxTokens: "摘要最大输出 tokens",
			modelLoading: "正在读取 DSH 已配置模型…",
			modelUnavailable: "未读取到模型目录，可手动输入 provider/model",
			invalidCompaction:
				"压缩设置无效：保留比例必须小于触发阈值；模型必须填写完整的 provider/model，或全部留空。",
		};
		const en = {
			nav: "Error improvement",
			title: "Error improvement and anti-regression",
			description:
				"Save confirmed mistakes as pre-task checks. The plugin injects relevant lessons only, performs no action, and connects to no external service.",
			enabled: "Enable pre-task lesson reminders",
			mode: "Matching mode",
			assist: "Relevant matches (recommended)",
			strict: "Inject every enabled lesson",
			maxLessons: "Maximum lessons per task (1–50)",
			maxChars: "Lesson context limit (500–50000 characters)",
			lessons: "Lessons",
			add: "Add lesson",
			save: "Save changes",
			reset: "Discard unsaved changes",
			remove: "Remove",
			lessonEnabled: "Enable this lesson",
			confirmed: "I confirm this lesson is correct",
			titleLabel: "Lesson title",
			mistake: "What went wrong previously",
			prevention: "How it must be prevented next time",
			scope: "Scope (optional)",
			keywords: "Match keywords (optional, separated by spaces or commas)",
			saved: "Saved. The next new task step will use these settings.",
			savedWithEdits:
				"The version present when saving began was saved; newer edits remain unsaved.",
			saving: "Saving…",
			conflict:
				"Settings changed elsewhere. Your draft was kept; review it, then save again or discard it.",
			rejected:
				"The settings were not written, likely because of a revision conflict or validation failure. Your draft was kept.",
			empty: "No lessons yet. Start with one confirmed real mistake.",
			unavailable:
				"The error-improvement Host is not loaded, so settings cannot be saved.",
			readonly: "This settings connection is read-only.",
			incomplete: "Every lesson needs a title and a prevention rule.",
			invalidNumber:
				"The lesson count or character limit is outside the allowed range.",
			unsaved: "There are unsaved changes.",
			error: "Save failed: {message}",
			compactionTitle: "Context Compaction",
			compactionEnabled: "Enable automatic compaction",
			compactionThreshold: "Compaction trigger threshold (% of context used)",
			compactionRetain: "Retain most recent fraction after compaction",
			compactionModel:
				"Primary summarization model (empty = current conversation model)",
			compactionFallbackModel:
				"Fallback summarization model (used when primary fails; empty = current conversation model)",
			compactionModelHint: "Format: provider/model, e.g. codexpp/gpt-5.6-sol",
			compactionMaxTokens: "Max output tokens for summary",
			modelLoading: "Reading configured DSH models…",
			modelUnavailable:
				"Model catalog unavailable; enter provider/model manually",
			invalidCompaction:
				"Invalid compaction settings: retain ratio must be lower than the trigger threshold, and every model route must be a complete provider/model pair or blank.",
		};

		function normalize(value) {
			const usedIds = new Set();
			const lessons = Array.isArray(value?.lessons)
				? value.lessons.map((lesson, index) => {
						const requested = String(lesson.id || `legacy-${index + 1}`);
						let id = requested;
						let suffix = 2;
						while (usedIds.has(id)) {
							id = `${requested}-${suffix}`;
							suffix += 1;
						}
						usedIds.add(id);
						return {
							id,
							title: String(lesson.title || ""),
							mistake: String(lesson.mistake || ""),
							prevention: String(lesson.prevention || ""),
							scope: String(lesson.scope || ""),
							keywords: String(lesson.keywords || ""),
							confirmed: lesson.confirmed === true,
							enabled: lesson.enabled !== false,
						};
					})
				: [];
			const c = value?.compaction || {};
			const compaction = {
				enabled: c.enabled !== false,
				thresholdRatio: Number.isFinite(c.thresholdRatio)
					? Math.max(0.1, Math.min(0.99, c.thresholdRatio))
					: 0.8,
				retainRatio: Number.isFinite(c.retainRatio)
					? Math.max(0.02, Math.min(0.5, c.retainRatio))
					: 0.16,
				summarizationProvider: String(c.summarizationProvider || ""),
				summarizationModel: String(c.summarizationModel || ""),
				fallbackSummarizationProvider: String(
					c.fallbackSummarizationProvider || "",
				),
				fallbackSummarizationModel: String(c.fallbackSummarizationModel || ""),
				maxTokens: Number.isFinite(c.maxTokens)
					? Math.max(256, Math.min(65536, Math.floor(c.maxTokens)))
					: 8192,
			};
			return {
				enabled: value?.enabled !== false,
				mode: value?.mode === "strict" ? "strict" : "assist",
				maxLessons: Number.isFinite(value?.maxLessons)
					? value.maxLessons
					: defaults.maxLessons,
				maxChars: Number.isFinite(value?.maxChars)
					? value.maxChars
					: defaults.maxChars,
				lessons,
				compaction,
			};
		}

		function clone(value) {
			return JSON.parse(JSON.stringify(value));
		}

		function sameValue(left, right) {
			return JSON.stringify(left) === JSON.stringify(right);
		}

		function completeRoute(provider, model) {
			return (
				Boolean(String(provider || "").trim()) ===
				Boolean(String(model || "").trim())
			);
		}

		function validCompaction(compaction) {
			return (
				compaction.retainRatio < compaction.thresholdRatio &&
				completeRoute(
					compaction.summarizationProvider,
					compaction.summarizationModel,
				) &&
				completeRoute(
					compaction.fallbackSummarizationProvider,
					compaction.fallbackSummarizationModel,
				)
			);
		}

		function createEditorController(initialSnapshot) {
			let base = normalize(initialSnapshot.value || defaults);
			let draft = clone(base);
			let baseRevision = initialSnapshot.revision;
			let saving = false;

			return {
				getState() {
					return {
						draft,
						dirty: !sameValue(draft, base),
						baseRevision,
						saving,
					};
				},
				update(change) {
					if (saving) return false;
					draft = change(clone(draft));
					return true;
				},
				reset(snapshot) {
					if (saving) return false;
					base = normalize(snapshot.value || defaults);
					draft = clone(base);
					baseRevision = snapshot.revision;
					return true;
				},
				observe(snapshot) {
					if (saving) return "saving";
					const incoming = normalize(snapshot.value || defaults);
					if (sameValue(incoming, base) && snapshot.revision === baseRevision)
						return "unchanged";
					const dirty = !sameValue(draft, base);
					base = incoming;
					baseRevision = snapshot.revision;
					if (dirty) return "conflict";
					draft = clone(incoming);
					return "adopted";
				},
				async save(scope) {
					if (saving) return { kind: "busy" };
					saving = true;
					const intended = clone(draft);
					const revision = baseRevision;
					try {
						await scope.mutate(
							Object.entries(intended).map(([key, fieldValue]) => ({
								op: "set",
								path: [key],
								value: fieldValue,
							})),
							revision,
						);
						const latest = scope.getSnapshot();
						const actual = normalize(latest.value || defaults);
						base = actual;
						baseRevision = latest.revision;
						if (!sameValue(actual, intended)) return { kind: "rejected" };
						draft = clone(actual);
						return { kind: "saved" };
					} catch (error) {
						return { kind: "error", error };
					} finally {
						saving = false;
					}
				},
			};
		}

		function responseValue(response) {
			return response?.result?.value ?? response?.value ?? response;
		}

		function normalizeModelList(list, provider = "") {
			if (!Array.isArray(list)) return [];
			return list
				.map((model) => {
					const id = String(model?.id || model?.model || "");
					const routeProvider = String(model?.provider || provider || "");
					return {
						id:
							routeProvider && !id.includes("/")
								? `${routeProvider}/${id}`
								: id,
						name: String(model?.name || id),
						provider: routeProvider,
					};
				})
				.filter((model) => model.id);
		}

		async function readModelCatalog(ctx) {
			try {
				const connection = ctx?.get?.("connection") ?? ctx?.connection;
				if (!connection?.api) return [];
				let models = [];
				if (typeof connection.api.llm?.discoverModels === "function") {
					const response = await connection.api.llm.discoverModels();
					const value = responseValue(response);
					models = normalizeModelList(value?.models ?? value);
				}
				if (
					models.length === 0 &&
					typeof connection.api.sessions?.modelCatalog === "function"
				) {
					const response = await connection.api.sessions.modelCatalog();
					const groups = responseValue(response)?.groups;
					if (Array.isArray(groups)) {
						for (const group of groups) {
							models.push(
								...normalizeModelList(
									group.models,
									String(group.provider || ""),
								),
							);
						}
					}
				}
				return models;
			} catch {
				return [];
			}
		}

		function useSnapshot(store) {
			return React.useSyncExternalStore(
				(listener) => store.subscribe(listener),
				() => store.getSnapshot(),
				() => store.getSnapshot(),
			);
		}

		function Section({ t, scope, ctx }) {
			const snapshot = useSnapshot(scope);
			const serialized = JSON.stringify(normalize(snapshot.value || defaults));
			const [controller] = React.useState(() =>
				createEditorController(snapshot),
			);
			const [editorState, setEditorState] = React.useState(() =>
				controller.getState(),
			);
			const [notice, setNotice] = React.useState(null);
			const [modelCatalog, setModelCatalog] = React.useState([]);
			const [modelCatalogLoading, setModelCatalogLoading] =
				React.useState(true);
			const refresh = () => setEditorState({ ...controller.getState() });

			React.useEffect(() => {
				let active = true;
				let timer;
				let attempts = 0;
				const load = async () => {
					attempts += 1;
					const models = await readModelCatalog(ctx);
					if (!active) return;
					if (models.length > 0 || attempts >= 4) {
						setModelCatalog(models);
						setModelCatalogLoading(false);
						return;
					}
					timer = setTimeout(load, 500);
				};
				setModelCatalogLoading(true);
				load();
				let disposeReset;
				try {
					disposeReset = ctx?.on?.("connection/reset", () => {
						attempts = 0;
						setModelCatalogLoading(true);
						load();
					});
				} catch {
					disposeReset = undefined;
				}
				return () => {
					active = false;
					if (timer !== undefined) clearTimeout(timer);
					disposeReset?.();
				};
			}, [ctx]);

			React.useEffect(() => {
				const outcome = controller.observe(snapshot);
				refresh();
				if (outcome === "conflict") {
					setNotice({ kind: "error", text: t("conflict") });
				} else if (outcome === "adopted") {
					setNotice(null);
				}
			}, [controller, serialized, snapshot.revision, t]);

			const { draft, dirty, saving } = editorState;
			const update = (change) => {
				if (!controller.update(change)) return;
				refresh();
				setNotice(null);
			};
			const setField = (key, value) =>
				update((current) => ({ ...current, [key]: value }));
			const setCompaction = (key, value) =>
				update((current) => ({
					...current,
					compaction: { ...current.compaction, [key]: value },
				}));
			const setLesson = (index, key, value) =>
				update((current) => ({
					...current,
					lessons: current.lessons.map((lesson, lessonIndex) =>
						lessonIndex === index ? { ...lesson, [key]: value } : lesson,
					),
				}));
			const routeValue = (provider, model) =>
				provider && model ? `${provider}/${model}` : "";
			const routeOptions = (provider, model) => {
				const selected = routeValue(provider, model);
				const options = modelCatalog.map((entry) => ({
					value: entry.id,
					label: entry.provider
						? `${entry.provider}/${entry.name}`
						: entry.name,
				}));
				if (selected && !options.some((entry) => entry.value === selected)) {
					options.unshift({ value: selected, label: `${selected} (current)` });
				}
				return options;
			};
			const setRoute = (prefix, value) => {
				const slash = value.indexOf("/");
				if (slash <= 0 || slash >= value.length - 1) {
					update((current) => ({
						...current,
						compaction: {
							...current.compaction,
							[`${prefix}Provider`]: "",
							[`${prefix}Model`]: "",
						},
					}));
					return;
				}
				update((current) => ({
					...current,
					compaction: {
						...current.compaction,
						[`${prefix}Provider`]: value.slice(0, slash),
						[`${prefix}Model`]: value.slice(slash + 1),
					},
				}));
			};
			const add = () =>
				update((current) => ({
					...current,
					lessons: [
						...current.lessons,
						{
							id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`,
							title: "",
							mistake: "",
							prevention: "",
							scope: "",
							keywords: "",
							confirmed: false,
							enabled: true,
						},
					],
				}));
			const remove = (index) =>
				update((current) => ({
					...current,
					lessons: current.lessons.filter(
						(_, lessonIndex) => lessonIndex !== index,
					),
				}));
			const reset = () => {
				if (!controller.reset(snapshot)) return;
				refresh();
				setNotice(null);
			};
			const save = async () => {
				const maxLessons = Math.floor(Number(draft.maxLessons));
				const maxChars = Math.floor(Number(draft.maxChars));
				if (
					maxLessons < 1 ||
					maxLessons > 50 ||
					maxChars < 500 ||
					maxChars > 50000
				) {
					setNotice({ kind: "error", text: t("invalidNumber") });
					return;
				}
				if (
					draft.lessons.some(
						(lesson) => !lesson.title.trim() || !lesson.prevention.trim(),
					)
				) {
					setNotice({ kind: "error", text: t("incomplete") });
					return;
				}
				if (!validCompaction(draft.compaction)) {
					setNotice({ kind: "error", text: t("invalidCompaction") });
					return;
				}
				controller.update((current) => ({ ...current, maxLessons, maxChars }));
				const pending = controller.save(scope);
				refresh();
				setNotice({ kind: "progress", text: t("saving") });
				const result = await pending;
				refresh();
				if (result.kind === "saved") {
					setNotice({ kind: "success", text: t("saved") });
				} else if (result.kind === "rejected") {
					setNotice({ kind: "error", text: t("rejected") });
				} else if (result.kind === "error") {
					setNotice({
						kind: "error",
						text: t("error", {
							message:
								result.error instanceof Error
									? result.error.message
									: String(result.error),
						}),
					});
				}
			};

			if (snapshot.status === "unavailable")
				return jsx.jsx("p", {
					style: styles.error,
					children: t("unavailable"),
				});
			const readOnly = snapshot.status !== "ready" || !snapshot.writable;

			return jsx.jsxs("section", {
				style: styles.section,
				children: [
					jsx.jsx("h2", { style: styles.title, children: t("title") }),
					jsx.jsx("p", { style: styles.copy, children: t("description") }),
					jsx.jsxs("label", {
						style: styles.check,
						children: [
							jsx.jsx("input", {
								type: "checkbox",
								checked: draft.enabled,
								disabled: readOnly || saving,
								onChange: (event) => setField("enabled", event.target.checked),
							}),
							t("enabled"),
						],
					}),
					jsx.jsxs("label", {
						style: styles.row,
						children: [
							jsx.jsx("span", { children: t("mode") }),
							jsx.jsxs("select", {
								value: draft.mode,
								disabled: readOnly || saving,
								onChange: (event) => setField("mode", event.target.value),
								style: styles.select,
								children: [
									jsx.jsx("option", { value: "assist", children: t("assist") }),
									jsx.jsx("option", { value: "strict", children: t("strict") }),
								],
							}),
						],
					}),
					jsx.jsxs("div", {
						style: styles.grid,
						children: [
							jsx.jsxs("label", {
								children: [
									jsx.jsx("span", { children: t("maxLessons") }),
									jsx.jsx("input", {
										type: "number",
										min: 1,
										max: 50,
										value: draft.maxLessons,
										disabled: readOnly || saving,
										onChange: (event) =>
											setField("maxLessons", Number(event.target.value)),
										style: styles.input,
									}),
								],
							}),
							jsx.jsxs("label", {
								children: [
									jsx.jsx("span", { children: t("maxChars") }),
									jsx.jsx("input", {
										type: "number",
										min: 500,
										max: 50000,
										value: draft.maxChars,
										disabled: readOnly || saving,
										onChange: (event) =>
											setField("maxChars", Number(event.target.value)),
										style: styles.input,
									}),
								],
							}),
						],
					}),
					jsx.jsxs("div", {
						style: styles.heading,
						children: [
							jsx.jsx("strong", { children: t("lessons") }),
							jsx.jsx("button", {
								type: "button",
								disabled: readOnly || saving,
								onClick: add,
								style: styles.button,
								children: t("add"),
							}),
						],
					}),
					draft.lessons.length === 0
						? jsx.jsx("p", { style: styles.hint, children: t("empty") })
						: draft.lessons.map((lesson, index) =>
								jsx.jsxs(
									"article",
									{
										style: styles.card,
										children: [
											jsx.jsxs("div", {
												style: styles.heading,
												children: [
													jsx.jsxs("label", {
														style: styles.check,
														children: [
															jsx.jsx("input", {
																type: "checkbox",
																checked: lesson.enabled,
																disabled: readOnly || saving,
																onChange: (event) =>
																	setLesson(
																		index,
																		"enabled",
																		event.target.checked,
																	),
															}),
															t("lessonEnabled"),
														],
													}),
													jsx.jsx("button", {
														type: "button",
														disabled: readOnly || saving,
														onClick: () => remove(index),
														style: styles.danger,
														children: t("remove"),
													}),
												],
											}),
											jsx.jsx("input", {
												value: lesson.title,
												disabled: readOnly || saving,
												placeholder: t("titleLabel"),
												onChange: (event) =>
													setLesson(index, "title", event.target.value),
												style: styles.wide,
											}),
											jsx.jsx("textarea", {
												value: lesson.mistake,
												disabled: readOnly || saving,
												placeholder: t("mistake"),
												onChange: (event) =>
													setLesson(index, "mistake", event.target.value),
												style: styles.textarea,
											}),
											jsx.jsx("textarea", {
												value: lesson.prevention,
												disabled: readOnly || saving,
												placeholder: t("prevention"),
												onChange: (event) =>
													setLesson(index, "prevention", event.target.value),
												style: styles.textarea,
											}),
											jsx.jsx("input", {
												value: lesson.scope,
												disabled: readOnly || saving,
												placeholder: t("scope"),
												onChange: (event) =>
													setLesson(index, "scope", event.target.value),
												style: styles.wide,
											}),
											jsx.jsx("input", {
												value: lesson.keywords,
												disabled: readOnly || saving,
												placeholder: t("keywords"),
												onChange: (event) =>
													setLesson(index, "keywords", event.target.value),
												style: styles.wide,
											}),
											jsx.jsxs("label", {
												style: styles.check,
												children: [
													jsx.jsx("input", {
														type: "checkbox",
														checked: lesson.confirmed,
														disabled: readOnly || saving,
														onChange: (event) =>
															setLesson(
																index,
																"confirmed",
																event.target.checked,
															),
													}),
													t("confirmed"),
												],
											}),
										],
									},
									lesson.id,
								),
							),
					readOnly
						? jsx.jsx("p", { style: styles.hint, children: t("readonly") })
						: null,
					// ─── Compaction panel ───
					jsx.jsx("hr", { style: styles.divider }),
					jsx.jsx("h3", { style: styles.h3, children: t("compactionTitle") }),
					jsx.jsx("label", {
						style: styles.checkboxRow,
						children: [
							jsx.jsx("input", {
								type: "checkbox",
								checked: draft.compaction?.enabled ?? true,
								disabled: readOnly || saving,
								onChange: (e) => setCompaction("enabled", e.target.checked),
							}),
							` ${t("compactionEnabled")}`,
						],
					}),
					jsx.jsxs("label", {
						style: styles.field,
						children: [
							t("compactionThreshold"),
							jsx.jsx("input", {
								type: "range",
								min: 10,
								max: 99,
								step: 1,
								value: Math.round(
									(draft.compaction?.thresholdRatio ?? 0.8) * 100,
								),
								disabled: readOnly || saving,
								onChange: (e) =>
									setCompaction("thresholdRatio", Number(e.target.value) / 100),
								style: styles.slider,
							}),
							` ${Math.round(
								(draft.compaction?.thresholdRatio ?? 0.8) * 100,
							)}%`,
						],
					}),
					jsx.jsxs("label", {
						style: styles.field,
						children: [
							t("compactionRetain"),
							jsx.jsx("input", {
								type: "range",
								min: 2,
								max: 50,
								step: 1,
								value: Math.round(
									(draft.compaction?.retainRatio ?? 0.16) * 100,
								),
								disabled: readOnly || saving,
								onChange: (e) =>
									setCompaction("retainRatio", Number(e.target.value) / 100),
								style: styles.slider,
							}),
							` ${Math.round((draft.compaction?.retainRatio ?? 0.16) * 100)}%`,
						],
					}),
					jsx.jsxs("label", {
						style: styles.field,
						children: [
							t("compactionModel"),
							jsx.jsx("select", {
								value: routeValue(
									draft.compaction?.summarizationProvider,
									draft.compaction?.summarizationModel,
								),
								disabled: readOnly || saving || modelCatalogLoading,
								onChange: (e) => setRoute("summarization", e.target.value),
								style: styles.select,
								children: [
									jsx.jsx("option", {
										value: "",
										children: "Auto / current conversation",
									}),
									...routeOptions(
										draft.compaction?.summarizationProvider,
										draft.compaction?.summarizationModel,
									).map((option) =>
										jsx.jsx(
											"option",
											{ value: option.value, children: option.label },
											option.value,
										),
									),
								],
							}),
							!modelCatalogLoading && modelCatalog.length === 0
								? jsx.jsx("input", {
										type: "text",
										value: routeValue(
											draft.compaction?.summarizationProvider,
											draft.compaction?.summarizationModel,
										),
										placeholder: t("compactionModelHint"),
										disabled: readOnly || saving,
										onChange: (e) => {
											const value = e.target.value.trim();
											setRoute("summarization", value);
										},
										style: styles.input,
									})
								: null,
							jsx.jsx("small", {
								style: styles.hint,
								children: modelCatalogLoading
									? t("modelLoading")
									: modelCatalog.length === 0
										? t("modelUnavailable")
										: t("compactionModelHint"),
							}),
						],
					}),
					jsx.jsxs("label", {
						style: styles.field,
						children: [
							t("compactionFallbackModel"),
							jsx.jsx("select", {
								value: routeValue(
									draft.compaction?.fallbackSummarizationProvider,
									draft.compaction?.fallbackSummarizationModel,
								),
								disabled: readOnly || saving || modelCatalogLoading,
								onChange: (e) =>
									setRoute("fallbackSummarization", e.target.value),
								style: styles.select,
								children: [
									jsx.jsx("option", {
										value: "",
										children: "Auto / current conversation",
									}),
									...routeOptions(
										draft.compaction?.fallbackSummarizationProvider,
										draft.compaction?.fallbackSummarizationModel,
									).map((option) =>
										jsx.jsx(
											"option",
											{ value: option.value, children: option.label },
											option.value,
										),
									),
								],
							}),
						],
					}),
					jsx.jsxs("label", {
						style: styles.field,
						children: [
							t("compactionMaxTokens"),
							jsx.jsx("input", {
								type: "number",
								min: 256,
								max: 65536,
								step: 256,
								value: draft.compaction?.maxTokens ?? 8192,
								disabled: readOnly || saving,
								onChange: (e) =>
									setCompaction("maxTokens", Number(e.target.value)),
								style: styles.numberField,
							}),
						],
					}),
					dirty && !readOnly
						? jsx.jsx("p", { style: styles.hint, children: t("unsaved") })
						: null,
					jsx.jsxs("div", {
						style: styles.actions,
						children: [
							jsx.jsx("button", {
								type: "button",
								disabled: readOnly || saving || !dirty,
								onClick: save,
								style: styles.button,
								children: t(saving ? "saving" : "save"),
							}),
							jsx.jsx("button", {
								type: "button",
								disabled: readOnly || saving || !dirty,
								onClick: reset,
								style: styles.secondary,
								children: t("reset"),
							}),
						],
					}),
					notice
						? jsx.jsx("p", {
								style:
									notice.kind === "success" ? styles.success : styles.error,
								children: notice.text,
							})
						: null,
				],
			});
		}

		const field = {
			width: "100%",
			boxSizing: "border-box",
			padding: "0 9px",
			borderRadius: 8,
			border: "1px solid var(--dsw-alias-border-l3)",
			background: "var(--dsw-alias-fill-quaternary)",
			color: "inherit",
			font: "inherit",
		};
		const styles = {
			section: {
				maxWidth: 780,
				display: "flex",
				flexDirection: "column",
				gap: 12,
				color: "var(--dsw-alias-label-primary)",
			},
			title: { margin: 0, fontSize: 16, fontWeight: 500 },
			copy: {
				margin: 0,
				color: "var(--dsw-alias-label-secondary)",
				fontSize: 14,
				lineHeight: "22px",
			},
			check: { display: "flex", gap: 8, alignItems: "center", fontSize: 14 },
			row: { display: "flex", gap: 12, alignItems: "center", fontSize: 14 },
			select: { ...field, width: "auto", height: 34 },
			grid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
				gap: 12,
			},
			input: { ...field, display: "block", marginTop: 5, height: 34 },
			wide: { ...field, height: 34 },
			textarea: { ...field, minHeight: 70, padding: 9, resize: "vertical" },
			heading: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 8,
			},
			card: {
				display: "flex",
				flexDirection: "column",
				gap: 8,
				padding: 12,
				borderRadius: 10,
				border: "1px solid var(--dsw-alias-border-l3)",
			},
			actions: { display: "flex", gap: 8, alignItems: "center" },
			button: {
				height: 34,
				padding: "0 14px",
				border: "none",
				borderRadius: 17,
				cursor: "pointer",
				background: "var(--dsw-alias-button-primary-fill)",
				color: "var(--dsw-alias-label-primary-foreground)",
			},
			secondary: {
				height: 34,
				padding: "0 14px",
				borderRadius: 17,
				cursor: "pointer",
				border: "1px solid var(--dsw-alias-border-l3)",
				background: "transparent",
				color: "inherit",
			},
			danger: {
				border: "none",
				background: "transparent",
				color: "var(--dsw-alias-state-error-primary)",
				cursor: "pointer",
			},
			hint: {
				margin: 0,
				color: "var(--dsw-alias-label-secondary)",
				fontSize: 12,
			},
			success: {
				margin: 0,
				color: "var(--dsw-alias-state-success-primary)",
				fontSize: 12,
			},
			error: {
				margin: 0,
				color: "var(--dsw-alias-state-error-primary)",
				fontSize: 12,
			},
			divider: {
				border: "none",
				borderTop: "1px solid var(--dsw-alias-border-l3)",
				margin: "8px 0",
			},
			h3: {
				margin: "4px 0 0 0",
				fontSize: 14,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)",
			},
			checkboxRow: {
				display: "flex",
				gap: 8,
				alignItems: "center",
				fontSize: 14,
			},
			field: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				fontSize: 13,
				color: "var(--dsw-alias-label-secondary)",
			},
			slider: {
				width: "100%",
				margin: "4px 0",
				accentColor: "var(--dsw-alias-button-primary-fill)",
			},
			numberField: {
				...field,
				width: 100,
				height: 30,
			},
		};

		const inject = ["slots", "locale", "settingsScope"];
		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(NS, { zh, en }),
				"error-improvement: locale dictionaries",
			);
			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "error-improvement",
						order: 36,
						label: () => t("nav"),
						locale: NS,
						inject: () => ({ t, scope, ctx }),
					},
					(props) => jsx.jsx(Section, props),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__test = { createEditorController, normalize, sameValue };
		return module.exports;
	},
});
