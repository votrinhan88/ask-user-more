import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG, findProjectConfig, resolveConfig, sanitizeLayer, updateUserConfig } from "../src/config.ts";

function tempHome(): string {
	return mkdtempSync(join(tmpdir(), "ask-user-more-home-"));
}

test("sanitizeLayer keeps only valid keys and values", () => {
	assert.deepEqual(sanitizeLayer({ renderer: "web", multiStyle: "booleans", warnOptionsAt: 3, warnQuestionsAt: 12 }), {
		renderer: "web",
		multiStyle: "booleans",
		warnOptionsAt: 3,
		warnQuestionsAt: 12,
	});
	assert.deepEqual(sanitizeLayer({ renderer: "nope", multiStyle: 4, warnOptionsAt: -1, warnQuestionsAt: 1.5 }), {});
	assert.deepEqual(sanitizeLayer(null), {});
	assert.deepEqual(sanitizeLayer("x"), {});
});

test("user file feeds the user layer; explicit env wins", () => {
	const home = tempHome();
	mkdirSync(join(home, ".config", "ask-user-more"), { recursive: true });
	writeFileSync(join(home, ".config", "ask-user-more", "config.json"), JSON.stringify({ renderer: "web", warnOptionsAt: 5 }));

	const user = resolveConfig({ home, env: {}, cwd: home });
	assert.equal(user.renderer, "web");
	assert.equal(user.warnOptionsAt, 5);

	const env = resolveConfig({ home, env: { ASK_USER_MORE_RENDERER: "terminal" }, cwd: home });
	assert.equal(env.renderer, "terminal");
	assert.equal(env.warnOptionsAt, 5);
});

test("precedence is per-call > env > project > user > defaults", () => {
	const home = tempHome();
	const root = mkdtempSync(join(tmpdir(), "ask-user-more-repo-"));
	mkdirSync(join(root, ".git"));
	const nested = join(root, "a", "b");
	mkdirSync(nested, { recursive: true });

	mkdirSync(join(home, ".config", "ask-user-more"), { recursive: true });
	writeFileSync(join(home, ".config", "ask-user-more", "config.json"), JSON.stringify({ renderer: "web", warnOptionsAt: 4 }));
	writeFileSync(
		join(root, ".ask-user-more.json"),
		JSON.stringify({ renderer: "terminal", warnQuestionsAt: 6, multiStyle: "booleans" }),
	);

	const project = resolveConfig({ home, cwd: nested, env: {} });
	assert.equal(project.renderer, "terminal"); // project > user
	assert.equal(project.warnOptionsAt, 4); // user value survives
	assert.equal(project.warnQuestionsAt, 6); // project only
	assert.equal(project.multiStyle, "booleans");
	assert.equal(project.warnQuestionsAt, 6);

	const env = resolveConfig({ home, cwd: nested, env: { ASK_USER_MORE_RENDERER: "elicitation" } });
	assert.equal(env.renderer, "elicitation"); // env > project

	const perCall = resolveConfig({ home, cwd: nested, env: { ASK_USER_MORE_RENDERER: "elicitation" }, perCall: "web" });
	assert.equal(perCall.renderer, "web"); // per-call > env
});

test("plugin userConfig env is the user layer, not the env layer", () => {
	const home = tempHome();
	const root = mkdtempSync(join(tmpdir(), "ask-user-more-repo2-"));
	writeFileSync(join(root, ".ask-user-more.json"), JSON.stringify({ renderer: "web" }));

	const config = resolveConfig({
		home,
		cwd: root,
		env: { ASK_USER_MORE_USER_RENDERER: "terminal" },
	});
	assert.equal(config.renderer, "web"); // project beats userConfig
});

test("findProjectConfig prefers the nearest file and stops at the repo root", () => {
	const root = mkdtempSync(join(tmpdir(), "ask-user-more-repo3-"));
	mkdirSync(join(root, ".git"));
	const nested = join(root, "x", "y");
	mkdirSync(nested, { recursive: true });
	writeFileSync(join(root, ".ask-user-more.json"), JSON.stringify({ renderer: "web" }));

	assert.equal(findProjectConfig(nested)?.layer.renderer, "web");
	writeFileSync(join(root, "x", ".ask-user-more.json"), JSON.stringify({ renderer: "terminal" }));
	assert.equal(findProjectConfig(nested)?.layer.renderer, "terminal");
});

test("enabled is user-level only; project files cannot grant it", () => {
	const home = tempHome();
	const root = mkdtempSync(join(tmpdir(), "ask-user-more-repo4-"));
	mkdirSync(join(root, ".git"));
	writeFileSync(join(root, ".ask-user-more.json"), JSON.stringify({ enabled: true, renderer: "web" }));

	assert.equal(resolveConfig({ home, cwd: root, env: {} }).enabled, undefined);
	assert.equal(resolveConfig({ home, cwd: root, env: { ASK_USER_MORE_ENABLED: "false" } }).enabled, false);
	assert.equal(resolveConfig({ home, cwd: root, env: { ASK_USER_MORE_USER_ENABLED: "true" } }).enabled, true);
});

test("updateUserConfig persists a user-level decision", () => {
	const home = tempHome();
	updateUserConfig({ enabled: true, renderer: "web" }, home);
	const resolved = resolveConfig({ home, cwd: home, env: {} });
	assert.equal(resolved.enabled, true);
	assert.equal(resolved.renderer, "web");
});

test("defaults are stable", () => {
	assert.deepEqual(DEFAULT_CONFIG, {
		renderer: "auto",
		warnOptionsAt: 7,
		warnQuestionsAt: 9,
		multiStyle: "array",
	});
});
