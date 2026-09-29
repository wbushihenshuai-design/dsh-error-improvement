window.__ModuleLoader__.load({
	id: "dsh-error-improvement",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		const React = require("react");
		const jsx = require("react/jsx-runtime");

		const NS = "error-improvement-ui";
		const CHANNEL = "/error-improvement";

		const zh = {
			nav: "错误改进",
			title: "错误改进 · 待确认草稿",
			description:
				"插件会从会话中自动采集“纠正/重复报错”候选，蒸馏成规则草稿。每条草稿必须在这里确认后才会生效；拒绝会记录决策，避免重复提议。毕业提案被确认后会写入 $DSH_HOME/skills/。",
			refresh: "刷新",
			loading: "正在读取草稿…",
			unavailable: "无法连接 Host（插件未启用或桌面端未连接）。",
			empty: "没有待确认的草稿。",
			stats:
				"当前记忆：{lessons} 条规则 · {recipes} 条配方 · {promotions} 条运行统计规则 · {drafts} 条待确认",
			approve: "确认生效",
			reject: "拒绝",
			approveDone: "已生效。",
			rejectDone: "已拒绝并记录决策。",
			graduation: "毕业提案（确认后生成 SKILL.md）",
			distillation: "蒸馏草稿",
			kindLesson: "规则",
			kindRecipe: "配方",
			mistake: "曾犯错误",
			prevention: "预防规则",
			problem: "问题",
			solution: "解法",
			applies: "适用",
			hits: "命中 {count} 次",
			error: "操作失败：{message}",
		};
		const en = {
			nav: "Error improvement",
			title: "Error improvement · Pending drafts",
			description:
				"The plugin captures corrections and repeated tool errors from sessions and distills them into draft lessons/recipes. A draft only takes effect after you confirm it here; rejecting records a decision so it is not proposed again. Confirmed graduation proposals are written to $DSH_HOME/skills/.",
			refresh: "Refresh",
			loading: "Loading drafts…",
			unavailable:
				"Cannot reach the Host (plugin disabled or desktop not connected).",
			empty: "No pending drafts.",
			stats:
				"Memory: {lessons} lessons · {recipes} recipes · {promotions} runtime rules · {drafts} pending",
			approve: "Approve",
			reject: "Reject",
			approveDone: "Approved.",
			rejectDone: "Rejected and logged.",
			graduation: "Graduation proposal (writes SKILL.md on approval)",
			distillation: "Distilled draft",
			kindLesson: "Lesson",
			kindRecipe: "Recipe",
			mistake: "Mistake",
			prevention: "Prevention",
			problem: "Problem",
			solution: "Solution",
			applies: "Applies",
			hits: "{count} hit(s)",
			error: "Operation failed: {message}",
		};

		const styles = {
			root: {
				display: "flex",
				flexDirection: "column",
				gap: 12,
				padding: "4px 0",
			},
			h3: {
				margin: 0,
				fontSize: 15,
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)",
			},
			hint: {
				margin: 0,
				fontSize: 12,
				color: "var(--dsw-alias-label-secondary)",
			},
			stats: {
				margin: 0,
				fontSize: 12,
				color: "var(--dsw-alias-label-secondary)",
			},
			card: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				padding: 12,
				borderRadius: 10,
				border: "1px solid var(--dsw-alias-border-l3)",
			},
			badge: {
				fontSize: 11,
				padding: "1px 8px",
				borderRadius: 8,
				border: "1px solid var(--dsw-alias-border-l3)",
				color: "var(--dsw-alias-label-secondary)",
			},
			row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
			body: {
				margin: 0,
				fontSize: 13,
				color: "var(--dsw-alias-label-primary)",
				whiteSpace: "pre-wrap",
			},
			button: {
				height: 30,
				padding: "0 14px",
				border: "none",
				borderRadius: 15,
				cursor: "pointer",
				background: "var(--dsw-alias-button-primary-fill)",
				color: "var(--dsw-alias-label-primary-foreground)",
			},
			secondary: {
				height: 30,
				padding: "0 14px",
				borderRadius: 15,
				cursor: "pointer",
				border: "1px solid var(--dsw-alias-border-l3)",
				background: "transparent",
				color: "inherit",
			},
			error: {
				margin: 0,
				fontSize: 12,
				color: "var(--dsw-alias-state-error-primary)",
			},
			success: {
				margin: 0,
				fontSize: 12,
				color: "var(--dsw-alias-state-success-primary)",
			},
		};

		function fmt(template, values) {
			return String(template).replace(/\{(\w+)\}/g, (_, key) =>
				String(values?.[key] ?? ""),
			);
		}

		function DraftCard({ draft, t, onApprove, onReject, onResolve }) {
			const [busy, setBusy] = React.useState("");
			const [message, setMessage] = React.useState("");
			const entry = draft.entry ?? {};
			const isRecipe = draft.kind === "recipe";
			const resolve = async (kind) => {
				setBusy(kind);
				setMessage("");
				try {
					const result = await (kind === "approve"
						? onApprove(draft.id)
						: onReject(draft.id));
					if (result?.ok === false) {
						setMessage(
							fmt(t("error"), {
								message: result.error || result.message || "unknown",
							}),
						);
					} else {
						setMessage(t(kind === "approve" ? "approveDone" : "rejectDone"));
						onResolve();
					}
				} catch (error) {
					setMessage(fmt(t("error"), { message: String(error) }));
				} finally {
					setBusy("");
				}
			};
			return jsx.jsxs("div", {
				style: styles.card,
				children: [
					jsx.jsxs("div", {
						style: styles.row,
						children: [
							jsx.jsx("strong", { children: entry.title || draft.id }),
							jsx.jsx("span", {
								style: styles.badge,
								children: t(isRecipe ? "kindRecipe" : "kindLesson"),
							}),
							jsx.jsx("span", {
								style: styles.badge,
								children: t(
									draft.from === "graduation" ? "graduation" : "distillation",
								),
							}),
							entry.hits > 0 &&
								jsx.jsx("span", {
									style: styles.badge,
									children: fmt(t("hits"), { count: entry.hits }),
								}),
						],
					}),
					entry.appliesWhen &&
						jsx.jsx("p", {
							style: styles.hint,
							children: `${t("applies")}: ${entry.appliesWhen}`,
						}),
					!isRecipe && entry.mistake
						? jsx.jsxs("p", {
								style: styles.body,
								children: [`${t("mistake")}: ${entry.mistake}`],
							})
						: null,
					jsx.jsx("p", {
						style: styles.body,
						children: isRecipe
							? `${t("solution")}: ${entry.solution}`
							: `${t("prevention")}: ${entry.prevention}`,
					}),
					jsx.jsxs("div", {
						style: styles.row,
						children: [
							jsx.jsx("button", {
								style: styles.button,
								disabled: busy !== "",
								onClick: () => resolve("approve"),
								children: t("approve"),
							}),
							jsx.jsx("button", {
								style: styles.secondary,
								disabled: busy !== "",
								onClick: () => resolve("reject"),
								children: t("reject"),
							}),
						],
					}),
					message
						? jsx.jsx("p", { style: styles.hint, children: message })
						: null,
				],
			});
		}

		function Section({ rpc, t }) {
			const [state, setState] = React.useState({
				loading: true,
				drafts: [],
				stats: null,
				error: "",
			});
			const load = React.useCallback(async () => {
				setState((prev) => ({ ...prev, loading: true, error: "" }));
				try {
					const [list, stats] = await Promise.all([
						rpc("drafts.list", {}),
						rpc("memory.stats", {}),
					]);
					setState({
						loading: false,
						drafts: list?.drafts ?? [],
						stats: stats ?? null,
						error: "",
					});
				} catch (error) {
					setState({
						loading: false,
						drafts: [],
						stats: null,
						error: String(error),
					});
				}
			}, [rpc]);
			React.useEffect(() => {
				void load();
			}, [load]);
			const approve = (id) => rpc("drafts.approve", { id });
			const reject = (id) => rpc("drafts.reject", { id });
			return jsx.jsxs("div", {
				style: styles.root,
				children: [
					jsx.jsx("h3", { style: styles.h3, children: t("title") }),
					jsx.jsx("p", { style: styles.hint, children: t("description") }),
					state.stats &&
						jsx.jsx("p", {
							style: styles.stats,
							children: fmt(t("stats"), {
								lessons: state.stats.lessons ?? 0,
								recipes: state.stats.recipes ?? 0,
								promotions: state.stats.promotions ?? 0,
								drafts: state.stats.drafts ?? 0,
							}),
						}),
					jsx.jsx("button", {
						style: styles.secondary,
						onClick: () => void load(),
						children: t("refresh"),
					}),
					state.loading &&
						jsx.jsx("p", { style: styles.hint, children: t("loading") }),
					state.error &&
						jsx.jsx("p", { style: styles.error, children: t("unavailable") }),
					!state.loading && !state.error && state.drafts.length === 0
						? jsx.jsx("p", { style: styles.hint, children: t("empty") })
						: null,
					...state.drafts.map((draft) =>
						jsx.jsx(DraftCard, {
							key: draft.id,
							draft,
							t,
							onApprove: approve,
							onReject: reject,
							onResolve: load,
						}),
					),
				],
			});
		}

		const inject = ["slots", "locale", "connection"];
		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(NS, { zh, en }),
				"error-improvement: locale dictionaries",
			);
			const t = ctx.locale.bind(NS);
			const rpc = (endpoint, payload) =>
				ctx.connection.rpc.call(CHANNEL, endpoint, payload);
			const WiredSection = (props) =>
				jsx.jsx(Section, {
					...props,
					t,
					rpc,
				});
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "error-improvement",
						order: 36,
						label: () => t("nav"),
						locale: NS,
					},
					(props) => jsx.jsx(WiredSection, props),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
