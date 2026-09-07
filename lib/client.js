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
			};
		}

		function clone(value) {
			return JSON.parse(JSON.stringify(value));
		}

		function sameValue(left, right) {
			return JSON.stringify(left) === JSON.stringify(right);
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

		function useSnapshot(store) {
			return React.useSyncExternalStore(
				(listener) => store.subscribe(listener),
				() => store.getSnapshot(),
				() => store.getSnapshot(),
			);
		}

		function Section({ t, scope }) {
			const snapshot = useSnapshot(scope);
			const serialized = JSON.stringify(normalize(snapshot.value || defaults));
			const [controller] = React.useState(() =>
				createEditorController(snapshot),
			);
			const [editorState, setEditorState] = React.useState(() =>
				controller.getState(),
			);
			const [notice, setNotice] = React.useState(null);
			const refresh = () => setEditorState({ ...controller.getState() });

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
			const setLesson = (index, key, value) =>
				update((current) => ({
					...current,
					lessons: current.lessons.map((lesson, lessonIndex) =>
						lessonIndex === index ? { ...lesson, [key]: value } : lesson,
					),
				}));
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
						inject: () => ({ t, scope }),
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
