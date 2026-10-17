/**
 * Terminal renderer: launches the standalone pi TUI in a new terminal window,
 * waits for its result file, and returns the answers.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AskAnswer, AskQuestion, WarnConfig } from "@ask-user-more/core";

export interface TerminalOptions {
	config: WarnConfig;
	timeoutMs?: number;
	/** Override for tests; defaults to ./tui.mjs next to the server bundle. */
	tuiPath?: string;
}

export interface TerminalResult {
	answers?: AskAnswer[];
	cancelled?: boolean;
	unavailable?: boolean;
}

export function isGuiHost(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.TERM_PROGRAM === "vscode" || env.VSCODE_INJECTION === "1";
}

export function isTerminalHost(env: NodeJS.ProcessEnv = process.env): boolean {
	return !isGuiHost(env) && Boolean(env.TERM || env.WT_SESSION || env.TERM_PROGRAM);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\''`)}'`;
}

function launch(tuiPath: string, requestPath: string, resultPath: string, dir: string): ChildProcess | undefined {
	const options = { detached: true, stdio: "ignore" as const };
	try {
		if (process.platform === "win32") {
			return spawn("cmd", ["/c", "start", "", "node", tuiPath, requestPath, resultPath], {
				...options,
				windowsHide: false,
			});
		}
		if (process.platform === "darwin") {
			const script = join(dir, "run.command");
			writeFileSync(
				script,
				`#!/bin/sh\nnode ${shellQuote(tuiPath)} ${shellQuote(requestPath)} ${shellQuote(resultPath)}\n`,
				"utf8",
			);
			chmodSync(script, 0o755);
			return spawn("open", [script], options);
		}
		return spawn("x-terminal-emulator", ["-e", "node", tuiPath, requestPath, resultPath], options);
	} catch {
		return undefined;
	}
}

export async function askViaTerminal(
	questions: AskQuestion[],
	options: TerminalOptions,
): Promise<TerminalResult> {
	const dir = mkdtempSync(join(tmpdir(), "ask-user-more-"));
	const requestPath = join(dir, "request.json");
	const resultPath = join(dir, "result.json");
	const tuiPath = options.tuiPath ?? fileURLToPath(new URL("./tui.mjs", import.meta.url));

	try {
		writeFileSync(requestPath, JSON.stringify({ questions, config: options.config }), "utf8");
		const child = launch(tuiPath, requestPath, resultPath, dir);
		if (!child) return { unavailable: true };
		let launchFailed = false;
		child.on("error", () => {
			launchFailed = true;
		});

		const deadline = Date.now() + (options.timeoutMs ?? 10 * 60 * 1000);
		while (Date.now() < deadline) {
			if (existsSync(resultPath)) {
				try {
					const result = JSON.parse(readFileSync(resultPath, "utf8")) as TerminalResult;
					return result.cancelled ? { cancelled: true } : { answers: result.answers ?? [] };
				} catch {
					return { cancelled: true };
				}
			}
			if (launchFailed) return { unavailable: true };
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		return { cancelled: true };
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// Best effort cleanup.
		}
	}
}
