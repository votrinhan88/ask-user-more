# AskUserMore for OpenAI Codex

Codex CLI **0.163+** supports MCP servers, native elicitation forms, project
`.codex/config.toml`, and skills. AskUserMore exposes `ask_user_more` as
`mcp__ask-user-more__ask_user_more`.

## Install

After the package is published:

```bash
codex mcp add ask-user-more --env ASK_USER_MORE_ENABLED=true --env ASK_USER_MORE_RENDERER=elicitation -- npx -y ask-user-more
```

Local checkout:

```bash
codex mcp add ask-user-more --env ASK_USER_MORE_ENABLED=true -- node C:\Users\votri\ask-user-more\plugins\ask-user-more\dist\server.mjs
```

Or edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.ask-user-more]
command = "npx"
args = ["-y", "ask-user-more"]

[mcp_servers.ask-user-more.env]
ASK_USER_MORE_ENABLED = "true"
ASK_USER_MORE_RENDERER = "elicitation"
# ASK_USER_MORE_WARN_OPTIONS = "7"
# ASK_USER_MORE_WARN_QUESTIONS = "9"
# ASK_USER_MORE_MULTI_STYLE = "array"
```

Check it:

```bash
codex mcp list
codex mcp get ask-user-more
```

## Project config

Codex reads `.codex/config.toml` from the project root down to the current
directory (closest wins), only in trusted projects. Override the server's env
there instead of using a separate tool-specific file:

```toml
[mcp_servers.ask-user-more.env]
ASK_USER_MORE_RENDERER = "elicitation"
ASK_USER_MORE_WARN_OPTIONS = "5"
```

This is the native Codex project config; no bare `.ask-user-more.json` is read.

## Renderers in Codex

- `auto` detects Codex (`CODEX_*` env) and prefers the **native elicitation form**.
  If the client cannot elicit, it falls back to the loopback web form.
- `renderer = "terminal"` launches the exact pi TUI in a new terminal window. Codex's
  sandbox may block launching a new window; use elicitation or web if that happens.
- `renderer = "web"` opens the loopback browser form.

Set the renderer in the MCP server's `env` (see above) or per call.

## Consent

`ASK_USER_MORE_ENABLED=true` in the MCP env skips the first-use consent form.
Without it, the first `ask_user_more` call shows one "Enable AskUserMore?" form
and stores the answer in `~/.config/ask-user-more/config.json`. Set it to
`false` to disable the tool.

## Tell Codex to use it

Add to `AGENTS.md` (repo or `~/.codex/AGENTS.md`):

```markdown
## Asking the user

When you need a multiple-choice answer, call `mcp__ask-user-more__ask_user_more`
instead of asking in plain text. It supports notes, more than four options, and
multi-question rounds.
```

Codex gives MCP tools standard names: `mcp__ask-user-more__ask_user_more`.

## Test

```bash
codex
# then:
# Ask me two questions with AskUserMore to test the form.
```

Approve the MCP server/tool if Codex asks. If the form looks wrong, check
`codex mcp list` and `codex doctor`.
