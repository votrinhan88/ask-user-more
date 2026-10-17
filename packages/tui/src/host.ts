/**
 * Standalone terminal host for AskUserMore.
 *
 * Usage: node tui.mjs <request.json> <result.json>
 *
 * The request is { questions, config? }; the result is
 * { answers, cancelled, questions } or { cancelled: true } on signal.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { ProcessTerminal, TuiMainScreen } from "@earendil-works/pi-tui";

import {
	DEFAULT_WARN_CONFIG,
	normalizeQuestions,
	type AskQuestion,
	type WarnConfig,
} from "@ask-user-more/core";

import { createQuestionnaireComponent, type QuestionnaireResult } from "./component.ts";
import { ansiTheme } from "./theme.ts";

const [, , requestPath, resultPath] = process.argv;
if (!requestPath || !resultPath) {
	console.error("usage: node tui.mjs <request.json> <result.json>");
	process.exit(2);
}

const request = JSON.parse(readFileSync(requestPath, "utf8")) as {
	questions: AskQuestion[];
	config?: WarnConfig;
};
const questions = normalizeQuestions(request.questions ?? []);
const config = request.config ?? DEFAULT_WARN_CONFIG;

const terminal = new ProcessTerminal();
const tui = new TuiMainScreen(terminal);

let finished = false;
function finish(result: QuestionnaireResult): void {
	if (finished) return;
	finished = true;
	try {
		writeFileSync(resultPath, JSON.stringify(result), "utf8");
	} catch (error) {
		console.error("ask-user-more tui: cannot write result:", error);
	}
	tui.stop();
	setTimeout(() => process.exit(0), 20);
}

process.on("SIGINT", () => finish({ answers: [], cancelled: true, questions }));
process.on("SIGTERM", () => finish({ answers: [], cancelled: true, questions }));

const component = createQuestionnaireComponent(tui, ansiTheme, questions, config, finish);
tui.addChild(component);
tui.setFocus(component);
tui.start();
