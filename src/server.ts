#!/usr/bin/env node
/**
 * AskUserMore — MCP server for Claude Code.
 *
 * Exposes `ask_user_more`, which turns the questions into a native Claude Code
 * elicitation form (single-select, multi-select, and a note per question) and
 * returns the answers in the same [Qn] / [Note] text shape as the pi build.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { renderAnswerText } from "./format.ts";
import {
	AskUserMoreParams,
	type AskQuestion,
	normalizeQuestions,
	optionWarnings,
	questionWarning,
	validateQuestions,
} from "./questions.ts";
import { resolveConfig, updateUserConfig } from "./config.ts";
import { askQuestions } from "./renderers/index.ts";

const VERSION = "0.1.0";

const server = new McpServer({ name: "ask-user-more", version: VERSION });

function disabledMessage(): string {
	return (
		"AskUserMore is disabled for this harness. Enable it with " +
		"`claude plugin configure ask-user-more` (Claude Code), `/ask-user-more-config enable` (pi), " +
		'or `"enabled": true` in ~/.config/ask-user-more/config.json.'
	);
}

/** One-time consent for clients without a native enable prompt. */
async function askConsent(mcp: Server): Promise<boolean | undefined> {
	try {
		const result = await mcp.elicitInput({
			message: "Enable AskUserMore for this harness?",
			requestedSchema: {
				type: "object",
				properties: {
					enabled: {
						type: "boolean",
						title: "Enable AskUserMore",
						description: "Use AskUserMore for question rounds in this client.",
						default: true,
					},
				},
				required: ["enabled"],
			},
		});
		if (result.action !== "accept" || !result.content) return undefined;
		return result.content.enabled === true;
	} catch {
		return undefined;
	}
}

server.registerTool(
	"ask_user_more",
	{
		title: "AskUserMore",
		description:
			"Ask the operator one or more multiple-choice questions and wait for the answers. " +
			"Set multiSelect for checkbox questions. Every question also offers a note for extra detail. " +
			"Prefer this over the built-in AskUserQuestion when you need notes, more than four options, or several questions. " +
			"Option labels in one question must be distinct.",
		inputSchema: AskUserMoreParams,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			openWorldHint: false,
		},
	},
	async (args) => {
		const questions = normalizeQuestions(args.questions as AskQuestion[]);
		const config = resolveConfig({ perCall: args.renderer, cwd: process.cwd() });

		const errors = validateQuestions(questions);
		if (errors.length > 0) {
			return {
				content: [{ type: "text" as const, text: errors.join("\n") }],
				isError: true,
			};
		}

		if (config.enabled === false) {
			return { content: [{ type: "text" as const, text: disabledMessage() }] };
		}
		if (config.enabled === undefined) {
			const granted = await askConsent(server.server);
			if (granted === undefined) {
				return { content: [{ type: "text" as const, text: disabledMessage() }] };
			}
			try {
				updateUserConfig({ enabled: granted });
			} catch {
				// The decision still applies to this call if the file cannot be written.
			}
			if (!granted) {
				return { content: [{ type: "text" as const, text: disabledMessage() }] };
			}
		}

		const warnings = [...optionWarnings(questions, config)];
		const countWarning = questionWarning(questions.length, config);
		if (countWarning) warnings.push(countWarning);

		try {
			const answers = await askQuestions(server.server, questions, config, warnings);
			if (!answers) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								"The user dismissed the AskUserMore form; no answers were collected. " +
								"Do not treat this as a choice. Ask them what is wrong with the questionnaire " +
								"(unclear question, missing options, wrong order, unnecessary question), then revise and re-ask.",
						},
					],
				};
			}

			const text = renderAnswerText(answers, questions);
			const warningText = warnings.length > 0 ? `\n\nNote:\n- ${warnings.join("\n- ")}` : "";

			return {
				content: [{ type: "text" as const, text: text + warningText }],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [{ type: "text" as const, text: `AskUserMore failed: ${message}` }],
				isError: true,
			};
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
const startup = resolveConfig();
console.error(
	`ask-user-more ${VERSION} ready (renderer=${startup.renderer}, multi=${startup.multiStyle}, ` +
		`warn options=${startup.warnOptionsAt}, warn questions=${startup.warnQuestionsAt})`,
);
