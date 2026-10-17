# AskUserMore

Richer multiple-choice questions for coding harnesses: a note on every question,
no four-option limit, multi-question rounds, and a local web fallback.

One repo, one version, native per-harness installs:

```
ask-user-more/
├── packages/core/                 # shared schema, config, state, formatting
├── plugins/ask-user-more/         # MCP server + Claude Code plugin + npm package
├── .claude-plugin/marketplace.json
└── pi/ask-user-more/              # pi extension (next increment)
```

- **Claude Code**: install the plugin from this marketplace, or run the MCP server
  with `npx ask-user-more`.
- **Pi**: `pi install npm:ask-user-more` (the same package declares a `pi` extension),
  or `pi -e ./plugins/ask-user-more/pi/index.js` locally.
- **OpenAI Codex**: `codex mcp add ask-user-more --env ASK_USER_MORE_ENABLED=true -- npx -y ask-user-more`.
- **Other MCP clients**: point their native MCP config at `ask-user-more` and pass
  `ASK_USER_MORE_*` env vars for project-level settings.

Build and test:

```bash
npm install
npm run build        # bundles packages/core into plugins/ask-user-more/dist
npm test             # core + plugin tests
npm run integration  # MCP stdio round-trip
npm run validate     # claude plugin validate plugins/ask-user-more
```

See `plugins/ask-user-more/README.md` for installation and configuration.
