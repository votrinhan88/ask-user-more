/**
 * Plain-text result formatting, matching the pi build:
 *
 *   [Q1] Which database?
 *        [1] SQLite | [Note] single-line note
 *   [Q2] Which scope?
 *        [1] Auth | [3] Admin panel
 *        [Note]
 *        | first line
 *        | second line
 */

import type { AskAnswer, AskOption, AskQuestion } from "./questions.ts";

function picksFor(answer: AskAnswer, options: AskOption[]): string {
	if (answer.selected.length === 0) return "(none)";
	return answer.selected
		.map((label) => {
			const index = options.findIndex((option) => option.label === label);
			return index >= 0 ? `[${index + 1}] ${label}` : label;
		})
		.join(" | ");
}

export function renderAnswerText(answers: AskAnswer[], questions: AskQuestion[]): string {
	return answers
		.map((answer, i) => {
			const options = questions[i]?.options ?? [];
			const head = `[Q${i + 1}] ${answer.question}\n ${picksFor(answer, options)}`;
			if (!answer.note) return head;
			const lines = answer.note.split(/\r?\n/);
			if (lines.length === 1) return `${head} | [Note] ${answer.note}`;
			return [head, " [Note]", ...lines.map((line) => ` | ${line}`)].join("\n");
		})
		.join("\n");
}
