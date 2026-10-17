import test from "node:test";
import assert from "node:assert/strict";

import { isCodexHost, isGuiHost, isTerminalHost } from "../src/renderers/terminal.ts";

test("GUI hosts are detected", () => {
	assert.equal(isGuiHost({ TERM_PROGRAM: "vscode" }), true);
	assert.equal(isGuiHost({ VSCODE_INJECTION: "1" }), true);
	assert.equal(isGuiHost({ TERM: "xterm-256color" }), false);
});

test("Codex hosts are detected", () => {
	assert.equal(isCodexHost({ CODEX_HOME: "/x" }), true);
	assert.equal(isCodexHost({ CODEX_THREAD_ID: "x" }), true);
	assert.equal(isCodexHost({}), false);
});

test("terminal hosts are detected and GUI wins", () => {
	assert.equal(isTerminalHost({ TERM: "xterm-256color" }), true);
	assert.equal(isTerminalHost({ WT_SESSION: "x" }), true);
	assert.equal(isTerminalHost({ TERM_PROGRAM: "vscode", TERM: "xterm" }), false);
	assert.equal(isTerminalHost({}), false);
});
