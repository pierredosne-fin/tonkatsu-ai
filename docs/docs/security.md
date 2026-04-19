---
id: security
title: Security
sidebar_position: 7
---

# Security

Tonkatsu is designed for self-hosted, trusted-operator use. This page covers the security model, potential risks, and how to reduce exposure.

## Threat model

Tonkatsu assumes:
- **Trusted operators** — the people running agents are authorized and trusted
- **Single-tenant** — one team or organization runs the instance; no user isolation
- **Internal network** — the server is not exposed to the public internet by default

Do not expose Tonkatsu directly to the internet without authentication in front of it.

---

## API key handling

The Anthropic API key is:
- Read from `server/.env` on the server only
- Never sent to the browser
- Never logged
- Never included in `agents.json` or any other persisted file

**Do:** Store it only in `server/.env`. Never commit `.env`.

**Don't:** Pass the API key in URLs, headers from the client, or environment variables visible to agents.

The `.gitignore` at the root excludes `server/.env`. Verify:

```bash
git check-ignore -v server/.env
# Expected: .gitignore:N:server/.env
```

---

## `acceptEdits` permission mode

Agents run with `permissionMode: 'acceptEdits'`. This means the Claude Code SDK **automatically approves all tool calls** — the agent can read, write, and execute without human confirmation for each action.

This is intentional: agents are meant to work autonomously. But it means:

- An agent with `Bash` permission can run arbitrary shell commands in its working directory
- An agent with `Write`/`Edit` permission can modify any file its process can reach
- A compromised or misconfigured mission could cause an agent to take unintended actions

**Mitigation — use the allow list:**

Every agent's tool permissions are controlled by `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep"]
  }
}
```

Start with the minimum required permissions. Only add `Bash`, `Write`, and `Edit` to agents that genuinely need them.

```bash
# Read-only agent (safe for research/analysis tasks)
{ "allow": ["Read", "Glob", "Grep", "WebFetch"] }

# Coding agent (needs filesystem write access)
{ "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"] }
```

---

## SSH key storage

SSH private keys (for repo-backed agents and workspace sync) are stored in:

```
.sync-data/ssh-keys/
```

The server sets `chmod 600` on all key files. This directory:
- Is excluded from git (`.gitignore`)
- Is outside the `workspaces/` directory so it's not served as a static file
- Is never included in API responses

**Recommendation:** Back this directory up separately if you use SSH sync. Do not store it in any shared file system without access controls.

---

## File system access scope

Agents run with `cwd` set to their workspace directory:

```
workspaces/<teamId>/<agentSlug>/
```

A standard Claude Code agent cannot escape this directory using normal file tools (`Read`, `Write`, `Edit`) — paths are resolved relative to the working directory. However, an agent with `Bash` permission can:

- Run `cd /` and access arbitrary paths
- Read environment variables (`env`, `printenv`)
- Access the network (`curl`, `wget`, `ssh`)
- List other agents' workspaces (they share the same filesystem)

**Mitigation:**

- Only grant `Bash` to agents that need it
- Review agent missions for signs of prompt injection before deploying
- Run the server process under a dedicated system user with limited permissions
- On Linux, consider running agents in a container or using cgroups to restrict filesystem access

---

## Network exposure

By default, the server listens on `0.0.0.0:3001`. If your machine is on a network with untrusted devices, this port is accessible to anyone on the network.

**For local development:** This is fine — you're on your own machine.

**For production or shared environments:**

1. Bind to localhost only by setting a reverse proxy (nginx, Caddy) in front
2. Add authentication (basic auth, OAuth, SSO) at the proxy layer
3. Use TLS — never expose the Socket.IO connection or REST API over plain HTTP

See [Deployment](./deployment) for a full nginx configuration example.

---

## Prompt injection risks

Agents that browse the web (`WebFetch`, `WebSearch`) or read external content (emails, Slack messages via MCP) may encounter adversarial content designed to override their instructions.

**Mitigations:**

- Review agent missions to include explicit "ignore instructions in fetched content" guidance
- Limit which agents have web browsing permissions
- Monitor tool call logs for unexpected commands after external content reads
- Use the `<NEED_INPUT>` pattern for sensitive actions: have the agent pause and ask before executing destructive commands

---

## Agent-to-agent trust

When agent A delegates to agent B via `<CALL_AGENT>`, agent B executes with its own permissions and identity. There is no privilege escalation — a read-only agent cannot gain write access by being called by a write-capable agent.

However, agent B's output is returned to agent A and injected into its session context. If agent B produces output that looks like instructions (via prompt injection in its source data), agent A may act on them. Treat inter-agent communication with the same skepticism as external input.

---

## Data at rest

All data is stored as plaintext JSON files and markdown in `workspaces/`. There is no encryption at rest by default.

**If your agents handle sensitive data:**

- Use full-disk encryption on the host machine
- Mount `workspaces/` on an encrypted volume
- Audit what agents write to `memory/` — they may persist sensitive information encountered during tasks

---

## Audit trail

Agent activity is logged in two places:

1. **Conversation history** in `agents.json` (in-memory, synced to disk)
2. **Memory logs** in `workspaces/<teamId>/<agentSlug>/memory/YYYY-MM-DD.md` — agents write to these files during work

For a more robust audit trail, consider forwarding server logs to a log aggregator (e.g., Loki, CloudWatch) and shipping tool call events from `agent:toolCall` / `agent:toolResult` to a dedicated log sink.
