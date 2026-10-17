# AskUserMore for Claude Code

Richer multiple-choice questions than Claude's built-in `AskUserQuestion`:
a **note** on every question, **no four-option limit**, and **multiple questions per round**.

> This is the Claude Code build. The pi terminal build lives at
> `~/.pi/agent/extensions/ask-user-more/` and keeps the arrow-key TUI.
> Claude Code cannot load pi extensions; MCP is its only model-callable extension point.

## What you get

- `ask_user_more` tool → `mcp__ask-user-more__ask_user_more`
- Single-select with option descriptions
- Multi-select (native array, or one checkbox per option as a fallback)
- One optional note per question (single-line or multi-line)
- Warnings at **7 options** and **9 questions** (configurable)
- An opt-out hook that replaces the built-in `AskUserQuestion`
- Layered config: per-call → env → project → user
- Results formatted like the pi build:

```
[Q1] Which database should the v1 backend use?
 [1] SQLite | [Note] my own potato database
[Q2] Which of these belong in the v1 scope?
 [1] Auth | [4] Public API
 [Note]
 | line one
 | line two
```

## Renderers

| Renderer | UI | Status |
|---|---|---|
| `elicitation` | Native inline form (Claude Code 2.1.302+) | available |
| `web` | Loopback browser form (`127.0.0.1`, random port, one-time token) | available |
| `terminal` | Standalone TUI in a new terminal window | next increment; currently falls back to elicitation |
| `auto` | Host-based selection | currently elicitation; terminal detection lands with the TUI |

Set the renderer in `userConfig` (`claude plugin configure ask-user-more`) or per call.

## Requirements

- Claude Code **2.1.302+**
- Node.js **22+**
- A browser for the `web` renderer; a terminal emulator for `terminal`

## Install

### 1. Local plugin

```bash
claude --plugin-dir C:\Users\votri\ask-user-more\plugins\ask-user-more
```

`--plugin-dir` accepts a directory or a `.zip`. It loads `.claude-plugin/plugin.json`,
`.mcp.json`, the `ask-user-more` skill, and the `PreToolUse` hook.

### 2. MCP server only

```bash
claude mcp add ask-user-more -s user -- node C:\Users\votri\ask-user-more\plugins\ask-user-more\dist\server.mjs
```

The tool appears as `mcp__ask-user-more__ask_user_more`. MCP-only installs have no
hook and no `userConfig`; use native harness settings or `ASK_USER_MORE_*` env vars.

### 3. npm (after publishing)

```bash
claude mcp add ask-user-more -s user -- npx -y ask-user-more
```

### 4. Marketplace

This repo is already a marketplace: the plugin lives at `plugins/ask-user-more/`
and the marketplace entry is at the repo root (see `docs/marketplace.example.json`).

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "ask-user-more",
  "description": "AskUserMore plugin marketplace",
  "owner": { "name": "Votri" },
  "plugins": [
    {
      "name": "ask-user-more",
      "description": "Richer multiple-choice questions for Claude Code.",
      "source": "./plugins/ask-user-more"
    }
  ]
}
```

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install ask-user-more@ask-user-more
claude plugin validate .          # the plugin
```

## Replacing the built-in

`enabled` is the master consent: the plugin prompts for it when you enable the plugin,
and `claude plugin configure ask-user-more` can change it later. Generic MCP installs
(no `userConfig`) get a one-time elicitation prompt on first use. Project files cannot
grant `enabled`; only the user can.

The plugin ships a `PreToolUse` hook on `AskUserQuestion`.

- `userConfig.force` defaults to **true** and is prompted once when you enable the plugin.
- When `force` is true, the hook denies the built-in and tells Claude to call
  `mcp__ask-user-more__ask_user_more`.
- Opt out with `claude plugin configure ask-user-more` → **Replace AskUserQuestion** → off.
- If the hook or MCP server is unavailable, the built-in is allowed (safe default).

`force` is intentionally **not** read from project files: a cloned repo must not be able
to replace your built-in.

## Configuration

Claude plugin `userConfig` (global):

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Allow this harness to use AskUserMore; off hides the tool |
| `force` | `true` | Replace `AskUserQuestion` via the hook (Claude only) |
| `renderer` | `auto` | `auto`, `elicitation`, `terminal`, `web` |
| `warnOptionsAt` | `7` | Warn at this many options; `0` disables |
| `warnQuestionsAt` | `9` | Warn at this many questions; `0` disables |
| `multiStyle` | `array` | `array` = native multi-select; `booleans` = one checkbox per option |

### Project settings

AskUserMore reads each harness's own project config; there is no bare file at the repo root.

**Claude Code** — `.claude/settings.json` (and `.claude/settings.local.json`):

```json
{
  "pluginConfigs": {
    "ask-user-more": {
      "options": { "renderer": "web", "warnOptionsAt": 5, "warnQuestionsAt": 12 }
    }
  }
}
```

Claude Code itself does not pass project plugin options to the server, so the server
reads this file directly. User options still arrive natively through `userConfig`.

**Pi** — `.pi/settings.json` (read after project trust):

```json
{
  "askUserMore": { "renderer": "terminal", "warnOptionsAt": 5 }
}
```

**Other MCP clients** — pass `ASK_USER_MORE_*` in their native MCP server config,
for example `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, or
`.codex/config.toml` (`[mcp_servers.ask-user-more]`).

Explicit env vars override the project:

| Env var | Meaning |
|---|---|
| `ASK_USER_MORE_RENDERER` | `auto`, `elicitation`, `terminal`, `web` |
| `ASK_USER_MORE_WARN_OPTIONS` | Warn at this many options |
| `ASK_USER_MORE_WARN_QUESTIONS` | Warn at this many questions |
| `ASK_USER_MORE_MULTI_STYLE` | `array` or `booleans` |

**Precedence:** per-call `renderer` > env > native project settings > native user
settings > defaults. `enabled` and `force` are user-level only; project files
cannot grant either.

Per-call override:

```json
{ "questions": [ ... ], "renderer": "web" }
```

## Develop

From the repo root:

```bash
npm install
npm run build        # bundles packages/core + SDK into plugins/ask-user-more/dist
npm test             # core + plugin tests
npm run integration  # MCP stdio round-trip
npm run typecheck
npm run validate     # claude plugin validate plugins/ask-user-more
```

## Publish

1. Bump the version in **three places**: `package.json`,
   `.claude-plugin/plugin.json`, and `VERSION` in `src/server.ts`.
2. From `plugins/ask-user-more`: `npm publish --access public`
   (rename if `ask-user-more` is taken).
3. For a marketplace, tag the repo and add the entry above.

## Limits

- Elicitation and web renderers are out-of-band or generic forms; the exact pi TUI
  (arrow keys, Ctrl+S, custom colors/summary) is the `terminal` renderer, landing next.
- The server reads the harness's native settings files and, for `web`, serves a
  loopback-only form and opens a browser. It makes no outbound network calls.
- `force` is user-level only; project files cannot replace your built-in.
