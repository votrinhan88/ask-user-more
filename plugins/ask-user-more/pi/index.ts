/**
 * AskUserMore for pi.
 *
 * Registers `ask_user_more` only in interactive TUI sessions, asks consent once
 * through the native pi settings (`askUserMore.enabled`), and mounts the shared
 * questionnaire component from @ask-user-more/tui.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineTool, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { createQuestionnaireComponent, type QuestionnaireResult } from "@ask-user-more/tui";
import {
	DEFAULT_WARN_CONFIG,
	normalizeQuestions,
	optionWarnings,
	questionWarning,
	renderAnswerText,
	resolveConfig,
	validateQuestions,
	type AskQuestion,
	type WarnConfig,
} from "@ask-user-more/core";

const ToolParams = Type.Object({
	questions: Type.Array(
		Type.Object({
			header: Type.String({ description: "Short tag naming the decision (max 12 chars)." }),
			question: Type.String({ description: "The question, self-contained, ending in a question mark." }),
			multiSelect: Type.Optional(
				Type.Boolean({ description: "True for checkbox questions where several options can apply." }),
			),
			options: Type.Array(
				Type.Object({
					label: Type.String({ description: "Short option name." }),
					description: Type.Optional(Type.String({ description: "The trade-off of this option." })),
					recommended: Type.Optional(Type.Boolean({ description: "Mark your recommended option(s)." })),
				}),
			),
		}),
	),
});

interface PiAskUserMoreSettings {
	enabled?: boolean;
	renderer?: "auto" | "elicitation" | "terminal" | "web";
	warnOptionsAt?: number;
	warnQuestionsAt?: number;
	multiStyle?: "array" | "booleans";
}

interface PiSettings {
	askUserMore?: PiAskUserMoreSettings;
	[key: string]: unknown;
}

const SETTINGS_PATH = join(getAgentDir(), "settings.json");

function readSettings(): PiSettings {
	try {
		const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as PiSettings;
		return raw && typeof raw === "object" ? raw : {};
	} catch {
		return {};
	}
}

function updateAskUserMore(patch: PiAskUserMoreSettings): PiAskUserMoreSettings {
	const settings = readSettings();
	settings.askUserMore = { ...settings.askUserMore, ...patch };
	writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
	return settings.askUserMore;
}

function configForPi(ctx: { cwd: string; isProjectTrusted(): boolean }) {
	return resolveConfig({
		harness: "pi",
		cwd: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
	});
}

function warningConfig(config: ReturnType<typeof configForPi>): WarnConfig {
	return { warnOptionsAt: config.warnOptionsAt, warnQuestionsAt: config.warnQuestionsAt };
}

const askUserMore = defineTool({
	name: "ask_user_more",
	label: "AskUserMore",
	description:
		"Ask the operator one or more multiple-choice questions and wait for the answers. " +
		"Set multiSelect for checkbox questions. Every question also offers a note for extra detail. " +
		"Option labels in one question must be distinct.",
	exposure: "model-only",
	executionMode: "sequential",
	parameters: ToolParams,

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const questions = normalizeQuestions(params.questions as AskQuestion[]);
		const config = configForPi(ctx);

		if (config.enabled === false) {
			return {
				content: [
					{
						type: "text" as const,
						text: "AskUserMore is disabled. Enable it with /ask-user-more-config enable.",
					},
				],
				details: undefined,
			};
		}

		const errors = validateQuestions(questions);
		if (errors.length > 0) {
			return { content: [{ type: "text" as const, text: errors.join("\n") }], isError: true, details: undefined };
		}

		const warnings = [...optionWarnings(questions, config)];
		const countWarning = questionWarning(questions.length, config);
		if (countWarning) warnings.push(countWarning);

		const result = await ctx.ui.custom<QuestionnaireResult>((tui, theme, _kb, done) =>
			createQuestionnaireComponent(tui, theme, questions, warningConfig(config), done),
		);

		if (result.cancelled) {
			return {
				content: [
					{
						type: "text" as const,
						text:
							"The user dismissed the questionnaire with Esc; no answers were collected. " +
							"Ask them what is wrong with the questionnaire, then revise and re-ask.",
					},
				],
				details: undefined,
			};
		}

		const warningText = warnings.length > 0 ? `\n\nNote:\n- ${warnings.join("\n- ")}` : "";
		return {
			content: [{ type: "text" as const, text: renderAnswerText(result.answers, questions) + warningText }],
			details: result,
		};
	},
});

export default function askUserMoreExtension(pi: ExtensionAPI) {
	let registered = false;

	const register = (enabled: boolean) => {
		registered = true;
		pi.registerTool(enabled ? askUserMore : { ...askUserMore, exposure: "hidden" });
	};

	pi.registerCommand("ask-user-more-config", {
		description:
			"Show or change AskUserMore: /ask-user-more-config [enable | disable | renderer auto|terminal|web | warn-options N | warn-questions N | reset]",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const current = readSettings().askUserMore ?? {};
			const show = () =>
				ctx.ui.notify(
					`AskUserMore: ${current.enabled === false ? "disabled" : "enabled"} · warnings options ${current.warnOptionsAt ?? DEFAULT_WARN_CONFIG.warnOptionsAt}, questions ${current.warnQuestionsAt ?? DEFAULT_WARN_CONFIG.warnQuestionsAt}`,
					"info",
				);

			if (parts.length === 0) {
				show();
				return;
			}

			const [command, value] = parts;
			if (command === "enable" || command === "disable") {
				updateAskUserMore({ enabled: command === "enable" });
				register(command === "enable");
				ctx.ui.notify(`AskUserMore ${command}d.`, "info");
				return;
			}
			if (command === "reset") {
				updateAskUserMore({
					enabled: true,
					warnOptionsAt: DEFAULT_WARN_CONFIG.warnOptionsAt,
					warnQuestionsAt: DEFAULT_WARN_CONFIG.warnQuestionsAt,
				});
				register(true);
				ctx.ui.notify("AskUserMore reset (enabled, default warnings).", "info");
				return;
			}
			if (command === "renderer" && value && ["auto", "elicitation", "terminal", "web"].includes(value)) {
				updateAskUserMore({ renderer: value as PiAskUserMoreSettings["renderer"] });
				ctx.ui.notify(`AskUserMore renderer: ${value} (pi always uses the native TUI).`, "info");
				return;
			}
			if ((command === "warn-options" || command === "warn-questions") && value !== undefined) {
				const n = Number(value);
				if (!Number.isInteger(n) || n < 0) {
					ctx.ui.notify(`Invalid threshold: ${value}`, "warning");
					return;
				}
				updateAskUserMore(command === "warn-options" ? { warnOptionsAt: n } : { warnQuestionsAt: n });
				ctx.ui.notify(`AskUserMore ${command}: ${n}.`, "info");
				return;
			}
			ctx.ui.notify(
				"Usage: /ask-user-more-config [enable | disable | renderer auto|terminal|web | warn-options N | warn-questions N | reset]",
				"warning",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const config = configForPi(ctx);
		if (config.enabled === undefined) {
			const enabled = await ctx.ui.confirm(
				"Enable AskUserMore?",
				"Use AskUserMore for multiple-choice questions in pi? You can change this later with /ask-user-more-config.",
			);
			updateAskUserMore({ enabled });
			if (!enabled) {
				register(false);
				return;
			}
		}
		if (!registered) register(config.enabled !== false);
	});
}
