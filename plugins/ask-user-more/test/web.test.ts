import test from "node:test";
import assert from "node:assert/strict";

import { askViaWeb, parseWebSubmission, renderWebForm } from "../src/renderers/web.ts";
import { normalizeQuestions, type AskQuestion } from "@ask-user-more/core";

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

function startWeb() {
	let resolveUrl!: (url: string) => void;
	const url = new Promise<string>((resolve) => {
		resolveUrl = resolve;
	});
	const answers = askViaWeb(questions, { timeoutMs: 5000, onUrl: resolveUrl });
	return { url, answers };
}

test("renderWebForm uses radios, checkboxes, notes, and escapes labels", () => {
	const html = renderWebForm(
		[...questions, { header: "X", question: "X?", options: [{ label: "<script>alert(1)</script>" }] }],
		"tok",
		["one warning"],
	);
	assert.match(html, /type="radio"/);
	assert.match(html, /type="checkbox"/);
	assert.match(html, /<textarea name="q0_note"/);
	assert.match(html, /\(Recommended\)/);
	assert.match(html, /one warning/);
	assert.ok(!html.includes("<script>alert(1)</script>"));
	assert.match(html, /&lt;script&gt;/);
});

test("parseWebSubmission handles single, multi order, and notes", () => {
	const form = new URLSearchParams();
	form.set("q0_choice", "Postgres");
	form.set("q0_note", "  a note  ");
	form.append("q1_choice", "Public API");
	form.append("q1_choice", "Auth");
	form.set("q1_note", "line one\nline two");

	const answers = parseWebSubmission(questions, form);
	assert.deepEqual(answers[0].selected, ["Postgres"]);
	assert.equal(answers[0].note, "a note");
	assert.deepEqual(answers[1].selected, ["Auth", "Public API"]);
	assert.equal(answers[1].note, "line one\nline two");
});

test("parseWebSubmission ignores unknown labels and blanks", () => {
	const form = new URLSearchParams();
	form.set("q0_choice", "MySQL");
	form.append("q1_choice", "Auth");
	form.append("q1_choice", "Nope");
	form.set("q0_note", "   ");

	const answers = parseWebSubmission(questions, form);
	assert.deepEqual(answers[0].selected, []);
	assert.equal(answers[0].note, undefined);
	assert.deepEqual(answers[1].selected, ["Auth"]);
});

test("askViaWeb serves the form and resolves submitted answers", async () => {
	process.env.ASK_USER_MORE_NO_BROWSER = "1";
	const { url, answers } = startWeb();
	const formUrl = await url;

	const formResponse = await fetch(formUrl);
	assert.equal(formResponse.status, 200);
	assert.match(await formResponse.text(), /AskUserMore/);

	const submit = new URL(formUrl);
	submit.pathname = "/submit";
	const body = new URLSearchParams();
	body.set("q0_choice", "SQLite");
	body.set("q0_note", "web note");
	body.append("q1_choice", "Public API");
	body.append("q1_choice", "Billing");
	const response = await fetch(submit, { method: "POST", body });
	assert.equal(response.status, 200);

	const result = await answers;
	assert.deepEqual(result?.[0].selected, ["SQLite"]);
	assert.equal(result?.[0].note, "web note");
	assert.deepEqual(result?.[1].selected, ["Billing", "Public API"]);
});

test("askViaWeb rejects a bad token and cancels cleanly", async () => {
	process.env.ASK_USER_MORE_NO_BROWSER = "1";
	const { url, answers } = startWeb();
	const formUrl = await url;

	const bad = new URL(formUrl);
	bad.searchParams.set("token", "nope");
	const response = await fetch(bad);
	assert.equal(response.status, 401);

	const cancel = new URL(formUrl);
	cancel.pathname = "/cancel";
	await fetch(cancel, { method: "POST" });
	assert.equal(await answers, undefined);
});
