import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "pre-tool-use.mjs");

function run(force, payload) {
	const env = { ...process.env };
	if (force === undefined) delete env.CLAUDE_PLUGIN_OPTION_FORCE;
	else env.CLAUDE_PLUGIN_OPTION_FORCE = force;
	return spawnSync(process.execPath, [hook], {
		input: JSON.stringify(payload),
		env,
		encoding: "utf8",
	});
}

test("force=true denies AskUserQuestion with a reason", () => {
	const result = run("true", { tool_name: "AskUserQuestion" });
	assert.equal(result.status, 0);
	const output = JSON.parse(result.stdout);
	assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
	assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
	assert.match(output.hookSpecificOutput.permissionDecisionReason, /mcp__ask-user-more__ask_user_more/);
});

test("force=false allows the built-in", () => {
	const result = run("false", { tool_name: "AskUserQuestion" });
	assert.equal(result.status, 0);
	assert.equal(result.stdout.trim(), "");
});

test("missing force allows the built-in", () => {
	const result = run(undefined, { tool_name: "AskUserQuestion" });
	assert.equal(result.status, 0);
	assert.equal(result.stdout.trim(), "");
});

test("other tools are untouched", () => {
	const result = run("true", { tool_name: "Bash" });
	assert.equal(result.status, 0);
	assert.equal(result.stdout.trim(), "");
});
