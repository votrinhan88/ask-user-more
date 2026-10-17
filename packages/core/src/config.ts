/**
 * Layered configuration with native per-harness adapters.
 *
 * Precedence (highest first):
 *   per-call renderer > explicit env (ASK_USER_MORE_*) > native project settings
 *   > native user settings > defaults.
 *
 * Adapters:
 *   Claude: user/project `.claude/settings.json` -> pluginConfigs["ask-user-more"]
 *   Pi:     user/project settings.json -> "askUserMore"
 *   other:  env passed by the harness's native MCP config (generic)
 *
 * `enabled` and `force` are user-level consent only; project adapters drop them.
 * `force` is hook-only and is not part of this config at all.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { DEFAULT_WARN_OPTIONS_AT, DEFAULT_WARN_QUESTIONS_AT, type WarnConfig } from "./questions.ts";

export type Renderer = "auto" | "elicitation" | "terminal" | "web";
export type MultiStyle = "array" | "booleans";
export type Harness = "claude" | "pi" | "generic";

export interface AskUserMoreConfig extends WarnConfig {
	/** undefined = ask on first use; user-level only. */
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
	/** Per-call renderer override. Cannot grant `enabled`. */
	perCall?: unknown;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	home?: string;
	harness?: Harness;
	/** Pi project settings are read only when the project is trusted. */
	projectTrusted?: boolean;
}

type Layer = Partial<AskUserMoreConfig>;

const RENDERERS: Renderer[] = ["auto", "elicitation", "terminal", "web"];
const MULTI_STYLES: MultiStyle[] = ["array", "booleans"];

export function detectHarness(env: NodeJS.ProcessEnv = process.env): Harness {
	const forced = env.ASK_USER_MORE_HARNESS;
	if (forced === "claude" || forced === "pi" || forced === "generic") return forced;
	if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE || env.CLAUDE_CODE_SSE_PORT) {
		return "claude";
	}
	if (env.PI_CODING_AGENT_DIR || env.PI_SESSION_ID || env.PI_AGENT_DIR) return "pi";
	return "generic";
}

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

function readObject(path: string): Record<string, unknown> | undefined {
	const value = readJson(path);
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function findNearestDir(cwd: string, files: string[]): string | undefined {
	let dir = resolve(cwd);
	while (true) {
		if (files.some((file) => existsSync(join(dir, file)) && statSync(join(dir, file)).isFile())) return dir;
		if (existsSync(join(dir, ".git"))) return undefined;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

// ---------------------------------------------------------------------------
// Claude Code: settings.json -> pluginConfigs["ask-user-more"] (or @marketplace)
// ---------------------------------------------------------------------------

function claudePluginLayer(settingsPath: string): Layer {
	const settings = readObject(settingsPath);
	const configs = settings?.pluginConfigs;
	if (!configs || typeof configs !== "object" || Array.isArray(configs)) return {};
	const entries = Object.entries(configs as Record<string, unknown>);
	const entry =
		entries.find(([key]) => key === "ask-user-more") ??
		entries.find(([key]) => key.startsWith("ask-user-more"));
	if (!entry) return {};
	const value = entry[1];
	const payload =
		value && typeof value === "object" && "options" in value
			? (value as { options?: unknown }).options
			: value;
	return sanitizeLayer(payload);
}

function claudeUserLayer(home: string): Layer {
	return claudePluginLayer(join(home, ".claude", "settings.json"));
}

function claudeProjectLayer(cwd: string, home: string): Layer {
	const dir = findNearestDir(cwd, [".claude/settings.json", ".claude/settings.local.json"]);
	if (!dir) return {};
	const projectSettings = resolve(join(dir, ".claude", "settings.json"));
	const userSettings = resolve(join(home, ".claude", "settings.json"));
	const layer: Layer = {};
	// Running in the home directory must not re-read the user file as a project file.
	if (projectSettings !== userSettings) Object.assign(layer, claudePluginLayer(projectSettings));
	Object.assign(layer, claudePluginLayer(join(dir, ".claude", "settings.local.json")));
	return layer;
}

// ---------------------------------------------------------------------------
// Pi: settings.json -> "askUserMore"
// ---------------------------------------------------------------------------

function piLayer(path: string): Layer {
	const settings = readObject(path);
	if (!settings) return {};
	return sanitizeLayer(settings.askUserMore ?? settings["ask-user-more"]);
}

function piUserLayer(home: string): Layer {
	return piLayer(join(home, ".pi", "agent", "settings.json"));
}

function piProjectLayer(cwd: string): Layer {
	const dir = findNearestDir(cwd, [".pi/settings.json"]);
	return dir ? piLayer(join(dir, ".pi", "settings.json")) : {};
}

// ---------------------------------------------------------------------------
// Generic clients and env
// ---------------------------------------------------------------------------

function genericUserLayer(home: string): Layer {
	return sanitizeLayer(readJson(join(home, ".config", "ask-user-more", "config.json")));
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

function pluginUserEnvLayer(env: NodeJS.ProcessEnv): Layer {
	return sanitizeLayer({
		enabled: env.ASK_USER_MORE_USER_ENABLED,
		renderer: env.ASK_USER_MORE_USER_RENDERER,
		multiStyle: env.ASK_USER_MORE_USER_MULTI_STYLE,
		warnOptionsAt: env.ASK_USER_MORE_USER_WARN_OPTIONS,
		warnQuestionsAt: env.ASK_USER_MORE_USER_WARN_QUESTIONS,
	});
}

/** Persist a generic user-level decision (first-use consent, tests). */
export function updateUserConfig(patch: Partial<AskUserMoreConfig>, home = homedir()): void {
	const path = join(home, ".config", "ask-user-more", "config.json");
	const current = sanitizeLayer(readJson(path));
	const next = { ...current, ...patch };
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function resolveConfig({
	perCall,
	env = process.env,
	cwd = process.cwd(),
	home = homedir(),
	harness = detectHarness(env),
	projectTrusted = false,
}: ResolveOptions = {}): AskUserMoreConfig {
	const user: Layer = {
		...genericUserLayer(home),
		...(harness === "claude" ? claudeUserLayer(home) : {}),
		...(harness === "pi" ? piUserLayer(home) : {}),
		...pluginUserEnvLayer(env),
	};

	let project: Layer = {};
	if (harness === "claude") project = claudeProjectLayer(cwd, home);
	else if (harness === "pi" && projectTrusted) project = piProjectLayer(cwd);
	// Consent and replacement are user decisions; a cloned repo cannot grant them.
	delete project.enabled;

	const perCallLayer = sanitizeLayer({ renderer: perCall });

	return {
		...DEFAULT_CONFIG,
		...user,
		...project,
		...envLayer(env),
		...perCallLayer,
	};
}
