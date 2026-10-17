/** Renderer selection: explicit config, then host detection for `auto`. */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { AskUserMoreConfig } from "@ask-user-more/core";
import type { AskAnswer, AskQuestion } from "@ask-user-more/core";
import { askViaElicitation } from "./elicitation.ts";
import { askViaTerminal, isCodexHost, isTerminalHost } from "./terminal.ts";
import { askViaWeb } from "./web.ts";

export interface RenderOutcome {
	answers?: AskAnswer[];
	cancelled?: boolean;
}

export async function askQuestions(
	server: Server,
	questions: AskQuestion[],
	config: AskUserMoreConfig,
	warnings: string[],
): Promise<RenderOutcome> {
	if (config.renderer === "web") {
		const answers = await askViaWeb(questions, { warnings });
		return answers ? { answers } : { cancelled: true };
	}

	const codex = isCodexHost();
	if (config.renderer === "terminal" || (config.renderer === "auto" && !codex && isTerminalHost())) {
		const result = await askViaTerminal(questions, { config });
		if (result.answers) return { answers: result.answers };
		if (result.cancelled) return { cancelled: true };
		// The launcher was unavailable; fall through to the native form.
	}

	try {
		const answers = await askViaElicitation(server, questions, config, warnings);
		return answers ? { answers } : { cancelled: true };
	} catch {
		if (config.renderer === "auto") {
			const answers = await askViaWeb(questions, { warnings });
			return answers ? { answers } : { cancelled: true };
		}
		throw new Error(
			"AskUserMore: this client does not support elicitation. Set renderer=web or renderer=terminal.",
		);
	}
}
