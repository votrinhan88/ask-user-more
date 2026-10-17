import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
	DEFAULT_CONFIG,
	detectHarness,
	resolveConfig,
	sanitizeLayer,
	updateUserConfig,
} from "../src/config.ts";

function tempHome(): string {
	return mkdtempSync(join(tmpdir(), "ask-user-more-home-"));
}

function tempRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "ask-user-more-repo-"));
	mkdirSync(join(root, ".git"));
	return root;
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value));
}

test("sanitizeLayer keeps only valid keys and values", () => {
	assert.deepEqual(sanitizeLayer({ enabled: "true", renderer: "web", multiStyle: "booleans", warnOptionsAt: 3 }), {
		enabled: true,
		renderer: "web",
		multiStyle: "booleans",
		warnOptionsAt: 3,
	});
	assert.deepEqual(sanitizeLayer({ enabled: "nope", renderer: "x", warnOptionsAt: -1 }), {});
	assert.deepEqual(sanitizeLayer(null), {});
});

test("detects the harness from the environment", () => {
	assert.equal(detectHarness({ CLAUDE_PLUGIN_ROOT: "/x" }), "claude");
	assert.equal(detectHarness({ PI_CODING_AGENT_DIR: "/x" }), "pi");
	assert.equal(detectHarness({}), "generic");
	assert.equal(detectHarness({ ASK_USER_MORE_HARNESS: "pi" }), "pi");
});

test("Claude user config comes from pluginConfigs, including the options wrapper", () => {
	const home = tempHome();
	writeJson(join(home, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "web", warnOptionsAt: 5, enabled: true } } },
	});
	const config = resolveConfig({ home, harness: "claude", env: {}, cwd: home });
	assert.equal(config.renderer, "web");
	assert.equal(config.warnOptionsAt, 5);
	assert.equal(config.enabled, true);
});

test("Claude project settings override user settings; local overrides project", () => {
	const home = tempHome();
	const root = tempRepo();
	writeJson(join(home, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "web", warnOptionsAt: 4 } } },
	});
	writeJson(join(root, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more@ask-user-more": { options: { renderer: "terminal", warnQuestionsAt: 6 } } },
	});
	writeJson(join(root, ".claude", "settings.local.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "elicitation" } } },
	});
	const nested = join(root, "a", "b");
	mkdirSync(nested, { recursive: true });

	const config = resolveConfig({ home, harness: "claude", env: {}, cwd: nested });
	assert.equal(config.renderer, "elicitation"); // local > project
	assert.equal(config.warnOptionsAt, 4); // user survives
	assert.equal(config.warnQuestionsAt, 6); // project-only key survives
});

test("Claude user config arrives through ASK_USER_MORE_USER_* and overrides the file", () => {
	const home = tempHome();
	writeJson(join(home, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "web" } } },
	});
	const config = resolveConfig({
		home,
		harness: "claude",
		env: { ASK_USER_MORE_USER_RENDERER: "terminal" },
		cwd: home,
	});
	assert.equal(config.renderer, "terminal");
});

test("Pi reads askUserMore from native settings; project requires trust", () => {
	const home = tempHome();
	const root = tempRepo();
	writeJson(join(home, ".pi", "agent", "settings.json"), { askUserMore: { renderer: "terminal" } });
	writeJson(join(root, ".pi", "settings.json"), { askUserMore: { renderer: "web", warnQuestionsAt: 6 } });
	const nested = join(root, "x");
	mkdirSync(nested, { recursive: true });

	const untrusted = resolveConfig({ home, harness: "pi", cwd: nested, env: {}, projectTrusted: false });
	assert.equal(untrusted.renderer, "terminal");
	assert.equal(untrusted.warnQuestionsAt, 9);

	const trusted = resolveConfig({ home, harness: "pi", cwd: nested, env: {}, projectTrusted: true });
	assert.equal(trusted.renderer, "web");
	assert.equal(trusted.warnQuestionsAt, 6);
});

test("precedence is per-call > env > project > user > defaults", () => {
	const home = tempHome();
	const root = tempRepo();
	writeJson(join(home, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "web", warnOptionsAt: 4 } } },
	});
	writeJson(join(root, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "terminal", multiStyle: "booleans" } } },
	});

	const project = resolveConfig({ home, harness: "claude", env: {}, cwd: root });
	assert.equal(project.renderer, "terminal");
	assert.equal(project.warnOptionsAt, 4);
	assert.equal(project.multiStyle, "booleans");

	const env = resolveConfig({ home, harness: "claude", env: { ASK_USER_MORE_RENDERER: "elicitation" }, cwd: root });
	assert.equal(env.renderer, "elicitation");

	const perCall = resolveConfig({
		home,
		harness: "claude",
		env: { ASK_USER_MORE_RENDERER: "elicitation" },
		perCall: "web",
		cwd: root,
	});
	assert.equal(perCall.renderer, "web");
});

test("project settings cannot grant enabled", () => {
	const home = tempHome();
	const root = tempRepo();
	writeJson(join(root, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { enabled: true, renderer: "web" } } },
	});
	const config = resolveConfig({ home, harness: "claude", env: {}, cwd: root });
	assert.equal(config.enabled, undefined);
	assert.equal(config.renderer, "web");
});

test("generic harness reads only the generic user file and env", () => {
	const home = tempHome();
	const root = tempRepo();
	writeJson(join(root, ".claude", "settings.json"), {
		pluginConfigs: { "ask-user-more": { options: { renderer: "web" } } },
	});
	const config = resolveConfig({ home, harness: "generic", env: {}, cwd: root });
	assert.equal(config.renderer, "auto");

	updateUserConfig({ renderer: "web", enabled: true }, home);
	const generic = resolveConfig({ home, harness: "generic", env: {}, cwd: root });
	assert.equal(generic.renderer, "web");
	assert.equal(generic.enabled, true);
});

test("defaults are stable", () => {
	assert.deepEqual(DEFAULT_CONFIG, {
		renderer: "auto",
		warnOptionsAt: 7,
		warnQuestionsAt: 9,
		multiStyle: "array",
	});
});
