---
id: getting-started
title: Getting Started
sidebar_position: 2
---

# Getting Started

## Prerequisites

- Node.js ≥ 18
- An [Anthropic API key](https://console.anthropic.com/)
- Git (required for repo-backed agents)

## Installation

```bash
git clone https://github.com/pierredosne/my-team.git
cd my-team
npm install
```

`npm install` runs at the workspace root and installs dependencies for both the `client` and `server` packages in one pass.

## Configuration

Create `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001  # optional, defaults to 3001
```

The API key is read only on the server side and never sent to the browser.

## Running in development

```bash
npm run dev
```

This starts two processes concurrently via `concurrently`:

| Process | Command | URL | Description |
|---------|---------|-----|-------------|
| Vite dev server | `npm run dev -w client` | http://localhost:5173 | React frontend with HMR |
| Express server | `npm run dev -w server` | http://localhost:3001 | API + Socket.IO, hot-reloads via `tsx watch` |

The Vite dev server proxies `/api` and `/socket.io` requests to `http://localhost:3001`, so you only need to open one URL in your browser.

To run each process independently:

```bash
npm run dev -w server   # Express only
npm run dev -w client   # Vite only
```

## Create your first agent

1. Open [http://localhost:5173](http://localhost:5173) — you'll see an empty 5×3 office grid.
2. Click **+ New Agent** in the top-right HUD.
3. Fill in the form:
   - **Name** — a short slug, e.g. `assistant`
   - **Mission** — one paragraph describing what the agent does, e.g. `You are a helpful general-purpose assistant. Answer questions clearly and concisely.`
   - **Avatar color** — pick any color
4. Click **Create**. The agent appears in an empty room on the grid.
5. Click the room to open the **ChatModal**.
6. Type a message and press **Enter** (or click Send).

The agent starts immediately. You'll see text streaming in real time, and any tool calls (file reads, bash commands, etc.) appear inline.

## Workspace layout on disk

Each agent gets a dedicated directory under `workspaces/<teamId>/<agentSlug>/`. These files are written by the server on agent creation and injected into the system prompt on every run:

```
workspaces/
  <teamId>/
    agents.json              # persisted runtime state for all agents in this team
    <agentSlug>/
      SOUL.md                # agent identity: name, mission, personality
      USER.md                # operator context: who this agent works for
      OPS.md                 # operational playbook: how to run tasks, git workflow
      MEMORY.md              # index of memory files (long-term knowledge)
      TOOLS.md               # available MCP tools and skills
      memory/                # append-only daily logs (YYYY-MM-DD.md) and project docs
      .claude/
        settings.json        # allowed tools and permissions
      .mcp.json              # MCP server configuration
repos/
  <repo-slug>/               # bare git clones for repo-backed agents
```

| File | Purpose |
|------|---------|
| `SOUL.md` | Defines the agent's name, mission, and personality. The agent reads this to know who it is. |
| `USER.md` | Describes the human operator: their role, preferences, communication style. |
| `OPS.md` | Operational guidelines: coding standards, git workflow, escalation rules. |
| `MEMORY.md` | Index pointing to files in `memory/`. Agents append learnings here during work. |
| `TOOLS.md` | Documents available MCP integrations and skills with usage notes. |

You can edit any of these files directly on disk or via the **AgentSidebar** in the UI.

## Read-only mode

Read-only mode lets you expose the Tonkatsu UI — so anyone can view agents, read conversation history, and watch streams — without granting write access. Agents cannot be created, modified, or deleted, and write-capable socket events (`agent:sleep`, `agent:newConversation`, `agent:moveRoom`) are silently ignored.

Enable it by setting an environment variable:

```env
# server/.env
READ_ONLY=true   # or READ_ONLY=1
```

On startup the server logs:
```
[startup] READ_ONLY mode enabled — write operations are disabled
```

The client fetches `GET /api/config` on load and receives `{ "readOnly": true }`, which disables write actions in the UI automatically.

**What is still allowed in read-only mode:**
- Viewing all agents, teams, and conversation history
- Subscribing to real-time streams (Socket.IO)
- Triggering an agent via `POST /api/agents/:id/trigger` (the one write exception)

**When to use it:**
- **Demos** — let stakeholders view agents working without risk of accidental changes
- **Shared/untrusted environments** — expose the UI on a shared network without granting write access
- **Horizontal scaling** — run multiple read-only instances behind a load balancer with one writer instance (see [Deployment → Scaling](./deployment#scaling))

## Building for production

```bash
npm run build
```

Outputs:
- `client/dist/` — static frontend assets (serve with any static file server or Express)
- `server/dist/` — compiled server JavaScript (run with `node dist/index.js`)

See [Deployment](./deployment) for production configuration details.
