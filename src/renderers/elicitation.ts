/** Native MCP elicitation renderer (inline form in capable clients). */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { AskUserMoreConfig } from "../config.ts";
import { buildForm } from "../elicit.ts";
import type { AskAnswer, AskQuestion } from "../questions.ts";

export async function askViaElicitation(
	server: Server,
	questions: AskQuestion[],
	config: AskUserMoreConfig,
	warnings: string[],
): Promise<AskAnswer[] | undefined> {
	const form = buildForm(questions, config.multiStyle, warnings);
	const result = await server.elicitInput({
		message: form.message,
		requestedSchema: form.requestedSchema,
	});
	if (result.action !== "accept" || !result.content) return undefined;
	return form.parse(result.content as Record<string, unknown>);
}
