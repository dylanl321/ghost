---
title: Connecting Codex to GHOST
lastUpdated: 2026-08-13
icon: i-heroicons-link
---

# Connecting Codex to GHOST

GHOST can connect directly to the Codex desktop app or Codex CLI through Model Context Protocol (MCP). The connection uses your GHOST identity and the AWS account access already assigned to you.

Open [MCP Connections](/chat/mcp) to get the current server URL and commands for this GHOST environment.

## Configure the Codex desktop app

1. In Codex, open **Settings**.
2. Select **Plugins**, choose **MCP**, then open **Custom**.
3. Create a custom MCP connection named **GHOST**.
4. Copy the server URL from [MCP Connections](/chat/mcp) and paste it into the server URL field.
5. Save the connection.
6. Complete the GHOST sign-in and authorization when Codex prompts you.
7. Confirm that GHOST is connected, then open a new Codex task.

## Configure the Codex CLI

Use the generated commands on [MCP Connections](/chat/mcp). The equivalent flow is:

    codex mcp add ghost --url <server-url> --oauth-resource <server-url>
    codex mcp login ghost
    codex mcp get ghost --json
    codex mcp list

Replace <code>&lt;server-url&gt;</code> with the current URL shown by GHOST. The URL must include the <code>/mcp</code> path.

To sign out or remove the connection:

    codex mcp logout ghost
    codex mcp remove ghost

## What authorization allows

Codex receives only the GHOST capabilities shown on the authorization screen. These can include:

- Reading AWS account details, costs, access, security findings, resources, and pipeline activity available to you
- Using GHOST AI insights and chat
- Managing your own GHOST preferences, chat threads, reports, and exports
- Requesting short-lived AWS role credentials for roles already assigned to you

Connecting Codex does not grant access to additional AWS accounts or roles. Credential issuance requires a separate confirmation and the credentials should remain process-local.

## Troubleshooting

### Failed to reauthenticate or not logged in

1. Close Codex completely.
2. Run the login command shown on [MCP Connections](/chat/mcp) again.
3. Complete the browser authorization.
4. Reopen Codex and start a new task.

If the problem continues, sign out with <code>codex mcp logout ghost</code>, then sign in again.

### GHOST does not appear in Codex

- Confirm the custom connection is enabled.
- Confirm the server URL exactly matches the value on [MCP Connections](/chat/mcp), including <code>/mcp</code>.
- In the CLI, run <code>codex mcp get ghost --json</code> and <code>codex mcp list</code>.
- Remove and recreate the connection if its saved URL is incorrect.

### Tools are missing or descriptions look outdated

- Confirm GHOST is connected and authenticated.
- Refresh the MCP connection if Codex offers that action.
- Start a new Codex task after refreshing. Existing tasks may retain the earlier tool catalog.
- Review the [GHOST tool catalog](/chat/mcp/details) to confirm that the capability exists.

### The authorization page does not open

- Retry the GHOST sign-in action from Codex.
- Confirm that your browser can reach GHOST and that your Entra session is active.
- Check that popups or external browser launches are not blocked by local policy.
- If you previously denied access, start the sign-in flow again.

### Account or role access is missing

GHOST applies your existing Entra and AWS Identity Center assignments. Verify that you can see the account in GHOST and ask:

> Which AWS accounts can I access, and what grants that access?

If an expected account or role is absent, contact the account owner or AWS Landing Zone team. Reconnecting MCP will not create new access.

### Credential requests require confirmation

The credential tool can issue only short-lived credentials for an account and role assigned to you. Complete the Identity Center authorization first, then approve the explicit credential confirmation in Codex. Never paste issued credentials into chat, tickets, or logs.

### Rate limit or service unavailable errors

- Wait briefly and retry the request once.
- Narrow broad requests to fewer accounts or a shorter time range.
- Check whether other GHOST pages are responding.
- Record the time and affected tool if the issue persists.

## Collect safe diagnostics

Include the following when requesting support:

- Whether you used the Codex desktop app or CLI
- Codex version
- GHOST environment and MCP server hostname
- Connection status or the output of <code>codex mcp get ghost --json</code>
- Exact error text
- Approximate timestamp and timezone
- Tool name and account identifier involved
- Whether a new task and fresh sign-in changed the result

Do not include OAuth tokens, refresh tokens, session cookies, AWS access keys, secret keys, or short-lived credentials.

## Get help

1. Review [MCP Connections](/chat/mcp) and verify the saved URL and sign-in state.
2. Try the recovery steps above in a new Codex task.
3. Use the [GHOST Support page](/support) to open a ServiceNow ticket or contact the support team.
4. Include the safe diagnostics listed above.
