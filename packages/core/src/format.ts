/**
 * Pure answer formatting for ask_user_more.
 *
 * The Submit summary, the transcript result, and the text the model receives
 * all render through these functions, so their shapes cannot drift apart.
 *
 * No TUI imports: width measurement and column slicing are injected through
 * `Metrics`, which lets the tests run headlessly with a naive implementation.
 */

import type { AskAnswer, AskOption, AskQuestion } from "./questions.ts";

export interface Metrics {
	/** Visible width, ignoring ANSI escape sequences and accounting for wide chars. */
	width(text: string): number;
	/** Visible-column slice (ANSI- and wide-char-aware). */
	slice(text: string, start: number, length: number): string;
}

export function stripAnsi(text: string): string {
	return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/** Character-based fallback used by tests and by callers without a theme. */
export const naiveMetrics: Metrics = {
	width: (text) => stripAnsi(text).length,
	slice: (text, start, length) => stripAnsi(text).slice(start, start + length),
};

export interface Paint {
	qTag: (s: string) => string;
	question: (s: string) => string;
	index: (s: string) => string;
	label: (s: string) => string;
	sep: (s: string) => string;
	none: (s: string) => string;
	noteTag: (s: string) => string;
	noteText: (s: string) => string;
	bar: (s: string) => string;
}

const identity = (s: string) => s;

export const plainPaint: Paint = {
	qTag: identity,
	question: identity,
	index: identity,
	label: identity,
	sep: identity,
	none: identity,
	noteTag: identity,
	noteText: identity,
	bar: identity,
};

export interface ThemeLike {
	fg(color: string, text: string): string;
}

export function makePaint(theme: ThemeLike): Paint {
	return {
		qTag: (s) => theme.fg("accent", s),
		question: (s) => theme.fg("text", s),
		index: (s) => theme.fg("success", s),
		label: (s) => theme.fg("text", s),
		sep: (s) => theme.fg("text", s),
		none: (s) => theme.fg("dim", s),
		noteTag: (s) => theme.fg("warning", s),
		noteText: (s) => theme.fg("text", s),
		bar: (s) => theme.fg("dim", s),
	};
}

/** Split a long unbroken token (URL, hash) so it cannot overrun the line. */
function hardBreak(word: string, limit: number, metrics: Metrics): string[] {
	if (limit <= 0 || metrics.width(word) <= limit) return [word];
	const chunks: string[] = [];
	let rest = word;
	while (rest && metrics.width(rest) > limit) {
		const chunk = metrics.slice(rest, 0, limit);
		if (!chunk) {
			chunks.push(rest);
			return chunks;
		}
		chunks.push(chunk);
		rest = rest.slice(chunk.length);
	}
	if (rest) chunks.push(rest);
	return chunks;
}

/**
 * Wrap the picks as `[n] label | [n] label`, keeping colours and separators.
 * Continuation lines start with a pipe so a wrapped pick is visibly joined.
 */
export function wrapPicks(
	selected: string[],
	options: AskOption[],
	paint: Paint,
	width: number | undefined,
	metrics: Metrics,
): string[] {
	if (selected.length === 0) return [];
	const inlineSep = paint.sep(" | ");
	const leadingSep = paint.sep("| ");
	const lines: string[] = [];
	let cur: string | null = null;

	for (const label of selected) {
		const n = options.findIndex((o) => o.label === label) + 1;
		const prefix = n > 0 ? `${paint.index(`[${n}]`)} ` : "";
		const words = label.split(/\s+/).filter(Boolean);
		let firstWord = true;

		for (const word of words) {
			const limit = width === undefined ? Infinity : Math.max(1, width - (firstWord ? metrics.width(prefix) : 0));
			const chunks = limit === Infinity ? [word] : hardBreak(word, limit, metrics);

			for (let c = 0; c < chunks.length; c++) {
				const startsPick = firstWord && c === 0;
				const piece = `${startsPick ? prefix : ""}${paint.label(chunks[c])}`;

				if (cur === null) {
					cur = startsPick ? piece : piece;
					continue;
				}
				const joiner = startsPick ? inlineSep : c > 0 ? "" : " ";
				const candidate: string = `${cur}${joiner}${piece}`;
				if (width !== undefined && metrics.width(candidate) > width) {
					lines.push(cur);
					cur = startsPick ? `${leadingSep}${piece}` : piece;
				} else {
					cur = candidate;
				}
			}
			firstWord = false;
		}
	}
	if (cur !== null) lines.push(cur);
	return lines;
}

/**
 * One answer as lines: question, indented picks, then either an inline note
 * (`… | [Note] text`) or a `[Note]` block with `| ` bars for multi-line notes.
 */
export function answerLines(
	answer: { selected: string[]; note?: string } | undefined,
	question: string,
	options: AskOption[],
	paint: Paint = plainPaint,
	maxWidth?: number,
	metrics: Metrics = naiveMetrics,
): string[] {
	const indent = " ";
	const picks = wrapPicks(
		answer?.selected ?? [],
		options,
		paint,
		maxWidth === undefined ? undefined : maxWidth - metrics.width(indent),
		metrics,
	);
	const pickLines = picks.length
		? picks.map((line, i) => `${i === 0 ? indent : " ".repeat(metrics.width(indent))}${line}`)
		: [`${indent}${paint.none("(none)")}`];

	const head = paint.question(question);
	if (!answer?.note) return [head, ...pickLines];

	const noteLines = answer.note.split(/\r?\n/);
	const noteTag = paint.noteTag("[Note]");
	const inlineTail = ` | ${noteTag} ${paint.noteText(answer.note)}`;
	if (noteLines.length === 1) {
		const last = pickLines[pickLines.length - 1] ?? "";
		const fits = maxWidth === undefined || metrics.width(last) + metrics.width(inlineTail) <= maxWidth;
		if (fits) {
			pickLines[pickLines.length - 1] = last + inlineTail;
			return [head, ...pickLines];
		}
	}
	return [
		head,
		...pickLines,
		`${indent}${noteTag}`,
		...noteLines.map((line) => `${indent}${paint.bar("| ")}${paint.noteText(line)}`),
	];
}

/** Whole result: `[Qn]` in front of every answerLines() block. */
export function renderAnswers(
	answers: AskAnswer[],
	questions: AskQuestion[],
	paint: Paint = plainPaint,
	maxWidth?: number,
	metrics: Metrics = naiveMetrics,
): string[] {
	const out: string[] = [];
	answers.forEach((answer, i) => {
		const question = questions[i];
		const body = answerLines(
			answer,
			question?.question ?? answer.question,
			question?.options ?? [],
			paint,
			maxWidth,
			metrics,
		);
		const tag = paint.qTag(`[Q${i + 1}]`);
		body.forEach((line, li) => out.push(li === 0 ? `${tag} ${line}` : line));
	});
	return out;
}

/** The plain-text result handed to the model. */
export function renderAnswerText(
	answers: AskAnswer[],
	questions: AskQuestion[],
	metrics: Metrics = naiveMetrics,
): string {
	return renderAnswers(answers, questions, plainPaint, undefined, metrics).join("\n");
}

/** One-line snippet for the compact note row: `head [...] tail`. */
export function noteSnippet(note: string, max = 48, metrics: Metrics = naiveMetrics): string {
	const ELLIPSIS = " [...] ";
	const flat = note
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" ");
	const total = metrics.width(flat);
	if (total <= max) return flat;
	if (max <= ELLIPSIS.length) return metrics.slice(flat, 0, Math.max(0, max));
	const budget = max - ELLIPSIS.length;
	const headWidth = Math.ceil(budget * 0.6);
	const tailWidth = budget - headWidth;
	const head = metrics.slice(flat, 0, headWidth).trimEnd();
	const tail = metrics.slice(flat, Math.max(0, total - tailWidth), tailWidth).trimStart();
	return `${head}${ELLIPSIS}${tail}`;
}
