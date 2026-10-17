import test from "node:test";
import assert from "node:assert/strict";

import {
	type AnswerDraft,
	allAnswered,
	buildAnswers,
	clearNote,
	DEFAULT_WARN_CONFIG,
	draftOf,
	HEADER_MAX,
	isAnswered,
	normalizeQuestions,
	normalizeWarnConfig,
	optionWarnings,
	orderedSelection,
	questionWarning,
	setNote,
	setSingle,
	toggleMulti,
	validateQuestions,
} from "../src/questions.ts";

const question = (header: string, labels: string[]) => ({
	header,
	question: "Pick one?",
	options: labels.map((label) => ({ label })),
});

const drafts = (): Map<number, AnswerDraft> => new Map();

test("normalizeQuestions fills missing headers, clamps length, defaults multiSelect", () => {
	const [unnamed] = normalizeQuestions([{ question: "?", options: [] }]);
	assert.equal(unnamed.header, "Q1");
	assert.equal(unnamed.multiSelect, false);

	const [long] = normalizeQuestions([{ header: "abcdefghijklmnop", question: "?", options: [] }]);
	assert.equal((long.header ?? "").length, HEADER_MAX);
});

test("validateQuestions rejects duplicate option labels per question", () => {
	const errors = validateQuestions(normalizeQuestions([question("Dup", ["A", "B", "A"])]));
	assert.equal(errors.length, 1);
	assert.match(errors[0], /duplicate/);
	assert.match(errors[0], /"A"/);
});

test("validateQuestions accepts distinct labels and flags an empty set", () => {
	assert.deepEqual(validateQuestions(normalizeQuestions([question("Q1", ["A", "B"])])), []);
	assert.equal(validateQuestions([]).length, 1);
});

test("setSingle picks, clears on a second press, and preserves the note", () => {
	let d = setNote(drafts(), 0, "keep me");
	d = setSingle(d, 0, "A");
	assert.deepEqual(draftOf(d, 0).selected, ["A"]);
	assert.equal(draftOf(d, 0).note, "keep me");

	d = setSingle(d, 0, "A");
	assert.deepEqual(draftOf(d, 0).selected, []);
	assert.equal(draftOf(d, 0).note, "keep me");
});

test("setSingle replaces a different pick", () => {
	let d = setSingle(drafts(), 0, "A");
	d = setSingle(d, 0, "B");
	assert.deepEqual(draftOf(d, 0).selected, ["B"]);
});

test("toggleMulti locks and unlocks without touching the note", () => {
	let d = setNote(drafts(), 0, "n");
	d = toggleMulti(d, 0, "A");
	d = toggleMulti(d, 0, "B");
	assert.deepEqual(draftOf(d, 0).selected, ["A", "B"]);

	d = toggleMulti(d, 0, "A");
	assert.deepEqual(draftOf(d, 0).selected, ["B"]);
	assert.equal(draftOf(d, 0).note, "n");
});

test("setNote trims and clears on empty", () => {
	let d = setNote(drafts(), 0, "  hi  ");
	assert.equal(draftOf(d, 0).note, "hi");

	d = setNote(d, 0, "   ");
	assert.equal(draftOf(d, 0).note, undefined);
});

test("clearNote removes only the note", () => {
	let d = setNote(toggleMulti(drafts(), 0, "A"), 0, "x");
	d = clearNote(d, 0);
	assert.equal(draftOf(d, 0).note, undefined);
	assert.deepEqual(draftOf(d, 0).selected, ["A"]);
});

test("orderedSelection sorts by option order, not click order", () => {
	const options = [{ label: "A" }, { label: "B" }, { label: "C" }];
	assert.deepEqual(orderedSelection({ selected: ["C", "A"] }, options), ["A", "C"]);
});

test("isAnswered accepts note-only answers and rejects blank ones", () => {
	assert.equal(isAnswered({ selected: [] }), false);
	assert.equal(isAnswered({ selected: [], note: "x" }), true);
	assert.equal(isAnswered({ selected: ["A"] }), true);
	assert.equal(isAnswered({ selected: [], note: "   " }), false);
});

test("buildAnswers orders picks and keeps notes", () => {
	const questions = normalizeQuestions([question("Q1", ["A", "B"])]);
	let d = toggleMulti(drafts(), 0, "B");
	d = toggleMulti(d, 0, "A");
	d = setNote(d, 0, "n");

	const answers = buildAnswers(questions, d);
	assert.deepEqual(answers[0].selected, ["A", "B"]);
	assert.equal(answers[0].note, "n");
});

test("allAnswered walks every question", () => {
	const d = new Map<number, AnswerDraft>([[0, { selected: ["A"] }]]);
	assert.equal(allAnswered(d, 1), true);
	assert.equal(allAnswered(d, 2), false);
});

test("default warning thresholds are 7 options and 9 questions", () => {
	assert.deepEqual(DEFAULT_WARN_CONFIG, { warnOptionsAt: 7, warnQuestionsAt: 9 });
});

test("optionWarnings triggers at 7 options, not 6, and 0 disables it", () => {
	const options = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `O${i}` }));
	const seven = normalizeQuestions([{ header: "Many", question: "?", options: options(7) }]);
	const six = normalizeQuestions([{ header: "Six", question: "?", options: options(6) }]);

	assert.equal(optionWarnings(seven, DEFAULT_WARN_CONFIG).length, 1);
	assert.equal(optionWarnings(six, DEFAULT_WARN_CONFIG).length, 0);
	assert.equal(optionWarnings(seven, { warnOptionsAt: 0, warnQuestionsAt: 9 }).length, 0);
});

test("questionWarning triggers at the configured count and 0 disables it", () => {
	assert.equal(questionWarning(8, DEFAULT_WARN_CONFIG), undefined);
	assert.match(questionWarning(9, DEFAULT_WARN_CONFIG) ?? "", /9 questions/);
	assert.equal(questionWarning(99, { warnOptionsAt: 7, warnQuestionsAt: 0 }), undefined);
});

test("normalizeWarnConfig keeps valid values and falls back on invalid ones", () => {
	assert.deepEqual(normalizeWarnConfig({ warnOptionsAt: 5 }), { warnOptionsAt: 5, warnQuestionsAt: 9 });
	assert.deepEqual(normalizeWarnConfig({ warnOptionsAt: -1, warnQuestionsAt: 3.5 }), DEFAULT_WARN_CONFIG);
	assert.deepEqual(normalizeWarnConfig(undefined), DEFAULT_WARN_CONFIG);
});


