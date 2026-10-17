# AskUserMore

Richer multiple-choice questions for coding harnesses: a note on every question,
no four-option limit, multi-question rounds, and a local web fallback.

One repo, one version, native per-harness installs:

```
ask-user-more/
├── packages/core/                 # shared schema, config, state, formatting
├── packages/tui/                  # exact questionnaire component + standalone host
├── plugins/ask-user-more/         # MCP server, Claude plugin, pi extension, npm package
└── .claude-plugin/marketplace.json
```

## Install

Pick your harness.

<details>
<summary><strong>Claude Code — plugin marketplace</strong></summary>

```bash
claude plugin marketplace add votrinhan88/ask-user-more
claude plugin install ask-user-more@ask-user-more
```

</details>

<details>
<summary><strong>Claude Code — MCP only</strong></summary>

```bash
claude mcp add ask-user-more -s user -- npx -y ask-user-more
```

</details>

<details>
<summary><strong>OpenAI Codex</strong></summary>

```bash
codex mcp add ask-user-more --env ASK_USER_MORE_ENABLED=true --env ASK_USER_MORE_RENDERER=elicitation -- npx -y ask-user-more
```

Then point Codex at the tool in `AGENTS.md`:

```markdown
When you need a multiple-choice answer, call `mcp__ask-user-more__ask_user_more`.
```

</details>

<details>
<summary><strong>Pi</strong></summary>

```bash
pi install npm:ask-user-more
```

Or load a local checkout for one session:

```bash
pi -e ./plugins/ask-user-more/pi/index.js
```

</details>

<details>
<summary><strong>Other MCP clients</strong></summary>

```json
{
  "mcpServers": {
    "ask-user-more": {
      "command": "npx",
      "args": ["-y", "ask-user-more"],
      "env": { "ASK_USER_MORE_ENABLED": "true" }
    }
  }
}
```

Project-level settings go in each client's native MCP config as `ASK_USER_MORE_*` env.

</details>

Build and test:

```bash
npm install
npm run build        # bundles packages/core into plugins/ask-user-more/dist
npm test             # core + plugin tests
npm run integration  # MCP stdio round-trip
npm run validate     # claude plugin validate plugins/ask-user-more
```

See `plugins/ask-user-more/README.md` for installation and configuration.
