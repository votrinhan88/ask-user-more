/**
 * Layered configuration for AskUserMore.
 *
 * Precedence (highest first):
 *   per-call > explicit env (ASK_USER_MORE_*) > project (.ask-user-more.json)
 *   > user (Claude plugin userConfig via ASK_USER_MORE_USER_*, or
 *     ~/.config/ask-user-more/config.json) > defaults.
 *
 * `force` is deliberately not part of this config: it is a user permission
 * read by the PreToolUse hook from CLAUDE_PLUGIN_OPTION_FORCE, so a cloned repo
 * cannot silently replace the built-in.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { DEFAULT_WARN_OPTIONS_AT, DEFAULT_WARN_QUESTIONS_AT, type WarnConfig } from "./questions.ts";

export type Renderer = "auto" | "elicitation" | "terminal" | "web";
export type MultiStyle = "array" | "booleans";

export interface AskUserMoreConfig extends WarnConfig {
	/** undefined = ask on first use; project files may not set this. */
	enabled?: boolean;
	renderer: Renderer;
	multiStyle: MultiStyle;
}

export const DEFAULT_CONFIG: AskUserMoreConfig = {
	renderer: "auto",
	warnOptionsAt: DEFAULT_WARN_OPTIONS_AT,
	warnQuestionsAt: DEFAULT_WARN_QUESTIONS_AT,
	multiStyle: "array",
};

export interface ResolveOptions {
	perCall?: unknown;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	/** Override the home directory (tests). */
	home?: string;
}

type Layer = Partial<AskUserMoreConfig>;

const RENDERERS: Renderer[] = ["auto", "elicitation", "terminal", "web"];
const MULTI_STYLES: MultiStyle[] = ["array", "booleans"];

function asInt(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		if (Number.isInteger(n) && n >= 0) return n;
	}
	return undefined;
}

/** Keep only known keys with valid values; ignore everything else. */
export function sanitizeLayer(raw: unknown): Layer {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const input = raw as Record<string, unknown>;
	const layer: Layer = {};
	if (input.enabled === true || input.enabled === "true") layer.enabled = true;
	else if (input.enabled === false || input.enabled === "false") layer.enabled = false;
	if (typeof input.renderer === "string" && RENDERERS.includes(input.renderer as Renderer)) {
		layer.renderer = input.renderer as Renderer;
	}
	if (typeof input.multiStyle === "string" && MULTI_STYLES.includes(input.multiStyle as MultiStyle)) {
		layer.multiStyle = input.multiStyle as MultiStyle;
	}
	const options = asInt(input.warnOptionsAt);
	if (options !== undefined) layer.warnOptionsAt = options;
	const questions = asInt(input.warnQuestionsAt);
	if (questions !== undefined) layer.warnQuestionsAt = questions;
	return layer;
}

function readJson(path: string): unknown {
	try {
		if (!existsSync(path) || !statSync(path).isFile()) return undefined;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function isGitRoot(dir: string): boolean {
	return existsSync(join(dir, ".git"));
}

/** Nearest `.ask-user-more.json`, walking up to the repo root. */
export function findProjectConfig(cwd: string): { path: string; layer: Layer } | undefined {
	let dir = resolve(cwd);
	while (true) {
		const candidate = join(dir, ".ask-user-more.json");
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			const layer = sanitizeLayer(readJson(candidate));
			// Consent is user-level only: a cloned repo must not enable the tool.
			delete layer.enabled;
			return { path: candidate, layer };
		}
		if (isGitRoot(dir)) return undefined;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function envLayer(env: NodeJS.ProcessEnv): Layer {
	return sanitizeLayer({
		enabled: env.ASK_USER_MORE_ENABLED,
		renderer: env.ASK_USER_MORE_RENDERER,
		multiStyle: env.ASK_USER_MORE_MULTI_STYLE,
		warnOptionsAt: env.ASK_USER_MORE_WARN_OPTIONS,
		warnQuestionsAt: env.ASK_USER_MORE_WARN_QUESTIONS,
	});
}

/** Global user settings: Claude plugin userConfig, then the generic file. */
function userLayer(env: NodeJS.ProcessEnv, home: string): Layer {
	const file = sanitizeLayer(readJson(join(home, ".config", "ask-user-more", "config.json")));
	const plugin = sanitizeLayer({
		enabled: env.ASK_USER_MORE_USER_ENABLED,
		renderer: env.ASK_USER_MORE_USER_RENDERER,
		multiStyle: env.ASK_USER_MORE_USER_MULTI_STYLE,
		warnOptionsAt: env.ASK_USER_MORE_USER_WARN_OPTIONS,
		warnQuestionsAt: env.ASK_USER_MORE_USER_WARN_QUESTIONS,
	});
	return { ...file, ...plugin };
}

/** Persist a user-level decision (used by the first-use consent). */
export function updateUserConfig(patch: Partial<AskUserMoreConfig>, home = homedir()): void {
	const path = join(home, ".config", "ask-user-more", "config.json");
	const current = sanitizeLayer(readJson(path));
	const next = { ...current, ...patch };
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}
`, "utf8");
}

export function resolveConfig({ perCall, env = process.env, cwd = process.cwd(), home = homedir() }: ResolveOptions = {}): AskUserMoreConfig {
	const project = findProjectConfig(cwd)?.layer ?? {};
	const perCallLayer = sanitizeLayer({ renderer: perCall });
	return {
		...DEFAULT_CONFIG,
		...userLayer(env, home),
		...project,
		...envLayer(env),
		...perCallLayer,
	};
}
