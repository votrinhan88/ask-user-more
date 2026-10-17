/**
 * AskUserMore — shared question model for the MCP server.
 *
 * Pure, no I/O: normalization, validation (duplicate labels), ordering, and
 * the warning thresholds shared with the pi build.
 */

import { z } from "zod";

export const OptionSchema = z.object({
	label: z.string().min(1),
	description: z.string().optional(),
	recommended: z.boolean().optional(),
});

export const QuestionSchema = z.object({
	header: z.string().optional(),
	question: z.string().min(1),
	multiSelect: z.boolean().optional(),
	options: z.array(OptionSchema),
});

export const AskUserMoreParams = z.object({
	questions: z.array(QuestionSchema).min(1),
	renderer: z.enum(["auto", "elicitation", "terminal", "web"]).optional(),
});

export type AskOption = z.infer<typeof OptionSchema>;
export type AskQuestion = z.infer<typeof QuestionSchema>;
export type AskParams = z.infer<typeof AskUserMoreParams>;

export interface AskAnswer {
	header: string;
	question: string;
	selected: string[];
	note?: string;
}

export const HEADER_MAX = 12;
export const DEFAULT_WARN_OPTIONS_AT = 7;
export const DEFAULT_WARN_QUESTIONS_AT = 9;

export interface WarnConfig {
	warnOptionsAt: number;
	warnQuestionsAt: number;
}

export function normalizeQuestions(raw: AskQuestion[]): AskQuestion[] {
	return raw.map((q, i) => ({
		header: (q.header || `Q${i + 1}`).slice(0, HEADER_MAX),
		question: q.question,
		multiSelect: q.multiSelect === true,
		options: q.options ?? [],
	}));
}

/** Empty means valid. Duplicate labels are rejected; everything else warns. */
export function validateQuestions(questions: AskQuestion[]): string[] {
	const errors: string[] = [];
	if (questions.length === 0) errors.push("At least one question is required.");
	questions.forEach((q, i) => {
		const counts = new Map<string, number>();
		for (const option of q.options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
		const duplicates = [...counts].filter(([, n]) => n > 1).map(([label]) => JSON.stringify(label));
		if (duplicates.length > 0) {
			errors.push(
				`Question ${i + 1} (${q.header}) has duplicate option labels: ${duplicates.join(", ")}. ` +
					"Option labels must be distinct: merge them or rename them, then call ask_user_more again.",
			);
		}
	});
	return errors;
}

export function optionWarnings(questions: AskQuestion[], config: WarnConfig): string[] {
	if (config.warnOptionsAt <= 0) return [];
	return questions.flatMap((q, i) =>
		q.options.length >= config.warnOptionsAt
			? [
					`Question ${i + 1} (${q.header}) has ${q.options.length} options (warn at ${config.warnOptionsAt}). ` +
						"Consider grouping or splitting the choices.",
				]
			: [],
	);
}

export function questionWarning(count: number, config: WarnConfig): string | undefined {
	if (config.warnQuestionsAt <= 0 || count < config.warnQuestionsAt) return undefined;
	return `${count} questions were asked (warn at ${config.warnQuestionsAt}). Consider splitting into rounds of 4.`;
}

/** Canonical answer order: the order the options appear in the question. */
export function orderedSelection(selected: string[], options: AskOption[]): string[] {
	const rank = new Map(options.map((option, i) => [option.label, i]));
	return [...selected].sort((a, b) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1));
}
