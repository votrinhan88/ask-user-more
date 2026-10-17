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

export const DEFAULT_WARN_CONFIG: WarnConfig = {
	warnOptionsAt: DEFAULT_WARN_OPTIONS_AT,
	warnQuestionsAt: DEFAULT_WARN_QUESTIONS_AT,
};

export function normalizeWarnConfig(raw: Partial<WarnConfig> | undefined): WarnConfig {
	const pick = (value: unknown, fallback: number) =>
		typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
	return {
		warnOptionsAt: pick(raw?.warnOptionsAt, DEFAULT_WARN_CONFIG.warnOptionsAt),
		warnQuestionsAt: pick(raw?.warnQuestionsAt, DEFAULT_WARN_CONFIG.warnQuestionsAt),
	};
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
export function orderedSelection(input: string[] | AnswerDraft, options: AskOption[]): string[] {
	const selected = Array.isArray(input) ? input : input.selected;
	const rank = new Map(options.map((option, i) => [option.label, i]));
	return [...selected].sort((a, b) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1));
}

/** One question's in-progress answer. */
export interface AnswerDraft {
	selected: string[];
	note?: string;
}

export type Drafts = Map<number, AnswerDraft>;

export function emptyDraft(): AnswerDraft {
	return { selected: [] };
}

export function draftOf(drafts: Drafts, questionIndex: number): AnswerDraft {
	return drafts.get(questionIndex) ?? emptyDraft();
}

function withDraft(drafts: Drafts, questionIndex: number, draft: AnswerDraft): Drafts {
	const next = new Map(drafts);
	next.set(questionIndex, draft);
	return next;
}

/** Single-select: picking the chosen option again clears it (blank is allowed). */
export function setSingle(drafts: Drafts, questionIndex: number, label: string): Drafts {
	const cur = draftOf(drafts, questionIndex);
	const chosen = cur.selected[0] === label;
	return withDraft(drafts, questionIndex, { ...cur, selected: chosen ? [] : [label] });
}

/** Multi-select: lock or unlock one option, leaving the note alone. */
export function toggleMulti(drafts: Drafts, questionIndex: number, label: string): Drafts {
	const cur = draftOf(drafts, questionIndex);
	const set = new Set(cur.selected);
	if (set.has(label)) set.delete(label);
	else set.add(label);
	return withDraft(drafts, questionIndex, { ...cur, selected: [...set] });
}

/** Empty/whitespace-only note clears it. */
export function setNote(drafts: Drafts, questionIndex: number, note: string): Drafts {
	const cur = draftOf(drafts, questionIndex);
	const trimmed = note.trim();
	const next: AnswerDraft = { ...cur };
	if (trimmed) next.note = trimmed;
	else delete next.note;
	return withDraft(drafts, questionIndex, next);
}

export function clearNote(drafts: Drafts, questionIndex: number): Drafts {
	const cur = draftOf(drafts, questionIndex);
	const next: AnswerDraft = { ...cur };
	delete next.note;
	return withDraft(drafts, questionIndex, next);
}

export function isAnswered(draft: AnswerDraft): boolean {
	return draft.selected.length > 0 || !!draft.note?.trim();
}

export function allAnswered(drafts: Drafts, questionCount: number): boolean {
	for (let i = 0; i < questionCount; i++) if (!isAnswered(draftOf(drafts, i))) return false;
	return true;
}

export function buildAnswers(questions: AskQuestion[], drafts: Drafts): AskAnswer[] {
	return questions.map((q, i) => {
		const draft = draftOf(drafts, i);
		return {
			header: q.header ?? `Q${i + 1}`,
			question: q.question,
			selected: orderedSelection(draft, q.options),
			note: draft.note,
		};
	});
}
