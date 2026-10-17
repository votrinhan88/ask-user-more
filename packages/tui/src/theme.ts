import type { QuestionnaireTheme } from "./component.ts";

const COLORS: Record<string, string> = {
	accent: "\u001b[35m",
	text: "",
	muted: "\u001b[90m",
	dim: "\u001b[2m",
	success: "\u001b[32m",
	warning: "\u001b[33m",
	error: "\u001b[31m",
};

export const ansiTheme: QuestionnaireTheme = {
	fg: (color, text) => (COLORS[color] ? `${COLORS[color]}${text}\u001b[0m` : text),
	bg: (_color, text) => `\u001b[44m${text}\u001b[0m`,
	bold: (text) => `\u001b[1m${text}\u001b[22m`,
};
