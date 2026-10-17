/** Renderer selection: config first, host detection later. */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { AskUserMoreConfig } from "../config.ts";
import type { AskAnswer, AskQuestion } from "../questions.ts";
import { askViaElicitation } from "./elicitation.ts";
import { askViaWeb } from "./web.ts";

export async function askQuestions(
	server: Server,
	questions: AskQuestion[],
	config: AskUserMoreConfig,
	warnings: string[],
): Promise<AskAnswer[] | undefined> {
	if (config.renderer === "web") {
		return askViaWeb(questions, { warnings });
	}
	if (config.renderer === "terminal") {
		// The standalone TUI lands in the next increment; do not fail the call.
		console.error("ask-user-more: terminal renderer not built yet; using elicitation");
		return askViaElicitation(server, questions, config, warnings);
	}
	// auto: host detection (terminal -> TUI) arrives with the terminal renderer.
	return askViaElicitation(server, questions, config, warnings);
}
