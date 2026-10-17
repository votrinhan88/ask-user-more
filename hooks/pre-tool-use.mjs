#!/usr/bin/env node
/**
 * Deny the built-in AskUserQuestion when the user enabled replacement.
 *
 * userConfig "force" reaches hooks as CLAUDE_PLUGIN_OPTION_FORCE. Default is
 * allow, so a missing/false value never traps the model.
 */
const raw = process.env.CLAUDE_PLUGIN_OPTION_FORCE;
const enabled = raw !== undefined && !["0", "false", "no", "off", ""].includes(raw.trim().toLowerCase());
if (!enabled) process.exit(0);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  if (payload?.tool_name !== "AskUserQuestion") process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "AskUserMore is enabled: call mcp__ask-user-more__ask_user_more instead of AskUserQuestion. " +
          "It supports notes, unlimited options, and multi-question rounds.",
      },
    }),
  );
});
