import test from "node:test";
import assert from "node:assert/strict";

import { buildForm } from "../src/elicit.ts";
import { renderAnswerText } from "@ask-user-more/core";
import { normalizeQuestions, validateQuestions, type AskQuestion } from "@ask-user-more/core";

const questions: AskQuestion[] = normalizeQuestions([
	{
		header: "Database",
		question: "Which database?",
		options: [
			{ label: "SQLite", description: "single file", recommended: true },
			{ label: "Postgres", description: "needs a server" },
		],
	},
	{
		header: "v1 scope",
		question: "Which scope?",
		multiSelect: true,
		options: [{ label: "Auth" }, { label: "Billing" }, { label: "Public API" }],
	},
]);

test("buildForm maps single, multi, and note fields", () => {
	const form = buildForm(questions, "array");
	const schema = form.requestedSchema as unknown as {
		type: string;
		properties: Record<string, { type: string; oneOf?: unknown[]; items?: unknown }>;
		required: string[];
	};

	assert.equal(schema.type, "object");
	assert.deepEqual(Object.keys(schema.properties), ["q0_choice", "q0_note", "q1_choices", "q1_note"]);
	assert.deepEqual(schema.required, []);
	assert.equal(schema.properties.q0_choice.type, "string");
	assert.equal(schema.properties.q1_choices.type, "array");
	assert.ok(schema.properties.q0_choice.oneOf);
});

test("parse accepts, orders, and keeps notes", () => {
	const form = buildForm(questions, "array");
	const answers = form.parse({
		q0_choice: "Postgres",
		q0_note: "  a note  ",
		q1_choices: ["Public API", "Auth"],
		q1_note: "line one\nline two",
	});

	assert.deepEqual(answers[0].selected, ["Postgres"]);
	assert.equal(answers[0].note, "a note");
	assert.deepEqual(answers[1].selected, ["Auth", "Public API"]);
	assert.equal(answers[1].note, "line one\nline two");
});

test("booleans style maps each option to a checkbox", () => {
	const form = buildForm([questions[1]], "booleans");
	const schema = form.requestedSchema as unknown as {
		properties: Record<string, { type: string }>;
	};
	assert.deepEqual(Object.keys(schema.properties), ["q0_opt_0", "q0_opt_1", "q0_opt_2", "q0_note"]);
	assert.equal(schema.properties.q0_opt_0.type, "boolean");

	const answers = form.parse({ q0_opt_0: true, q0_opt_2: true });
	assert.deepEqual(answers[0].selected, ["Auth", "Public API"]);
});

test("parse ignores unknown labels and blank notes", () => {
	const form = buildForm(questions, "array");
	const answers = form.parse({ q0_choice: "MySQL", q1_choices: ["Auth", "Nope"], q0_note: "   " });
	assert.deepEqual(answers[0].selected, []);
	assert.equal(answers[0].note, undefined);
	assert.deepEqual(answers[1].selected, ["Auth"]);
});

test("validateQuestions rejects duplicate labels", () => {
	const dup = normalizeQuestions([
		{ header: "Dup", question: "?", options: [{ label: "A" }, { label: "A" }] },
	]);
	const errors = validateQuestions(dup);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /duplicate/);
});

test("renderAnswerText uses inline and block notes", () => {
	const answers = [
		{ header: "Q1", question: "Pick one?", selected: ["Postgres"], note: "short" },
		{ header: "Q2", question: "Pick many?", selected: ["Auth", "Public API"], note: "a\nb" },
	];
	assert.equal(
		renderAnswerText(answers, questions),
		"[Q1] Pick one?\n [2] Postgres | [Note] short\n[Q2] Pick many?\n [1] Auth | [3] Public API\n [Note]\n | a\n | b",
	);
});
