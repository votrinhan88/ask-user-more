import test from "node:test";
import assert from "node:assert/strict";

import { naiveMetrics, noteSnippet, plainPaint, renderAnswers, stripAnsi } from "../src/format.ts";
import type { AskAnswer, AskQuestion } from "../src/questions.ts";

const questions: AskQuestion[] = [
	{ header: "Q1", question: "Pick one?", options: [{ label: "A" }, { label: "B" }, { label: "C" }] },
];

const answer = (selected: string[], note?: string): AskAnswer[] => [
	{ header: "Q1", question: "Pick one?", selected, note },
];

const lines = (answers: AskAnswer[], width?: number): string[] =>
	renderAnswers(answers, questions, plainPaint, width, naiveMetrics).map(stripAnsi);

test("a single-line note stays inline on the pick line", () => {
	assert.deepEqual(lines(answer(["A"], "short note")), ["[Q1] Pick one?", " [1] A | [Note] short note"]);
});

test("multiple picks keep the given order and use pipe separators", () => {
	assert.deepEqual(lines(answer(["A", "C"])), ["[Q1] Pick one?", " [1] A | [3] C"]);
});

test("a multi-line note becomes an indented bar block", () => {
	assert.deepEqual(lines(answer(["A", "C"], "x\ny")), [
		"[Q1] Pick one?",
		" [1] A | [3] C",
		" [Note]",
		" | x",
		" | y",
	]);
});

test("a blank note is not a block, and a blank answer says (none)", () => {
	assert.deepEqual(lines(answer([])), ["[Q1] Pick one?", " (none)"]);
	assert.deepEqual(lines(answer([], undefined)), ["[Q1] Pick one?", " (none)"]);
});

test("note-only answers render (none) with the note", () => {
	assert.deepEqual(lines(answer([], "just a note")), ["[Q1] Pick one?", " (none) | [Note] just a note"]);
});

test("boxed picks wrap inside the width, keeping an indent", () => {
	const longQuestions: AskQuestion[] = [
		{
			header: "Q1",
			question: "Pick?",
			options: [
				{ label: "A very long option label that should wrap across lines" },
				{ label: "Another long option label that also wraps" },
			],
		},
	];
	const out = renderAnswers(
		[
			{
				header: "Q1",
				question: "Pick?",
				selected: [longQuestions[0].options[0].label, longQuestions[0].options[1].label],
			},
		],
		longQuestions,
		plainPaint,
		30,
		naiveMetrics,
	).map(stripAnsi);

	assert.ok(
		out.every((line) => line.length <= 30),
		JSON.stringify(out),
	);
	// Continuation lines keep the indent and the continuation pipe.
	assert.ok(out.some((line) => line.startsWith(" | ")), JSON.stringify(out));
});

test("unbroken tokens are hard-broken instead of overflowing", () => {
	const longToken = "x".repeat(80);
	const out = renderAnswers(
		[{ header: "Q1", question: "Pick?", selected: [longToken] }],
		[{ header: "Q1", question: "Pick?", options: [{ label: longToken }] }],
		plainPaint,
		30,
		naiveMetrics,
	).map(stripAnsi);
	assert.ok(out.every((line) => line.length <= 30), JSON.stringify(out));
});

test("noteSnippet shortens long notes to the requested width", () => {
	assert.equal(noteSnippet("short", 48, naiveMetrics), "short");
	const long = noteSnippet("word ".repeat(40), 30, naiveMetrics);
	assert.match(long, /\[\.\.\.\]/);
	assert.ok(long.length <= 30, `${long.length}: ${long}`);
});

test("noteSnippet flattens line breaks", () => {
	assert.equal(noteSnippet("one\ntwo", 48, naiveMetrics), "one two");
});
