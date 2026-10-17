/**
 * Integration check: speaks MCP over stdio to dist/server.mjs, answers the
 * elicitation form, and asserts the tool result. Run `npm run build` first.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";

const child = spawn(process.execPath, ["dist/server.mjs"], {
	stdio: ["pipe", "pipe", "inherit"],
	env: { ...process.env, ASK_USER_MORE_USER_ENABLED: "true", ASK_USER_MORE_RENDERER: "elicitation" },
});
const rl = createInterface({ input: child.stdout });
const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
const pending = new Map();
let nextId = 1;
let sawElicitation = false;

const questions = [
	{
		header: "Database",
		question: "Which database?",
		options: [
			{ label: "SQLite", description: "single file", recommended: true },
			{ label: "Postgres", description: "server" },
		],
	},
	{
		header: "v1 scope",
		multiSelect: true,
		question: "Which scope?",
		options: [{ label: "Auth" }, { label: "Billing" }, { label: "Public API" }],
	},
];

rl.on("line", (line) => {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}

	if (message.method === "elicitation/create") {
		sawElicitation = true;
		const keys = Object.keys(message.params.requestedSchema.properties);
		assert.deepEqual(keys, ["q0_choice", "q0_note", "q1_choices", "q1_note"]);
		send({
			jsonrpc: "2.0",
			id: message.id,
			result: {
				action: "accept",
				content: {
					q0_choice: "SQLite",
					q0_note: "my note",
					q1_choices: ["Public API", "Auth"],
					q1_note: "line one\nline two",
				},
			},
		});
		return;
	}

	if (message.id !== undefined && (message.result || message.error)) {
		pending.get(message.id)?.(message);
	}
});

function request(method, params) {
	const id = nextId++;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		send({ jsonrpc: "2.0", id, method, params });
	});
}

const init = await request("initialize", {
	protocolVersion: "2025-06-18",
	capabilities: { elicitation: {} },
	clientInfo: { name: "ask-user-more-test", version: "0.0.0" },
});
assert.equal(init.result?.serverInfo?.name, "ask-user-more");

send({ jsonrpc: "2.0", method: "notifications/initialized" });

const tool = await request("tools/call", { name: "ask_user_more", arguments: { questions } });
const text = tool.result?.content?.[0]?.text ?? "";
assert.equal(sawElicitation, true);
assert.equal(
	text,
	"[Q1] Which database?\n [1] SQLite | [Note] my note\n[Q2] Which scope?\n [1] Auth | [3] Public API\n [Note]\n | line one\n | line two",
);

console.log("mcp integration: OK");
child.kill();
