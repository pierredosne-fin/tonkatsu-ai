---
id: agent-workspace
title: Agent Workspace
sidebar_position: 4
---

# Agent Workspace

Each agent gets a dedicated directory under `workspaces/<teamId>/<agentSlug>/`. This directory is the agent's entire world — it's the working directory for Claude Code, the source of its identity, and the storage for its memory.

## Directory structure

```
workspaces/<teamId>/<agentSlug>/
├── SOUL.md                # Who the agent is
├── USER.md                # Who the agent works for
├── OPS.md                 # How the agent should work
├── MEMORY.md              # Index of long-term memory files
├── TOOLS.md               # Available tools and environment notes
├── memory/
│   ├── 2024-01-15.md      # Append-only daily log
│   ├── 2024-01-16.md
│   └── projects/
│       └── my-project.md  # Long-lived project context
├── .claude/
│   └── settings.json      # Allowed tools and permissions
└── .mcp.json              # MCP server configuration
```

## Identity files

Written by `fileService.setupWorkspaceStructure()` on agent creation and injected into the system prompt on every run via `buildSystemPromptAppend()`.

---

### `SOUL.md` — Agent identity

Defines who the agent is. The agent reads this file to understand its name, role, and personality.

```markdown
---
name: documentation-writer
role: Technical Documentation Writer
---

# Soul

You are Documentation Writer, a specialist in creating clear, accurate,
developer-oriented documentation. Your writing is precise, scannable, and
packed with practical code examples.

## Traits
- You prioritize accuracy over brevity — get the details right
- You write for developers who want to copy-paste and move on
- You use concrete examples rather than abstract descriptions
```

---

### `USER.md` — Operator context

Describes the human operator: their role, technical background, communication preferences, and what they expect from the agent.

```markdown
---
operator: Pierre
role: Engineering Lead
---

# User Context

Pierre is the engineering lead for a fintech data platform. He has deep
backend expertise (Go, Python) but prefers terse communication — no
preamble, no summaries. He reads diffs, not descriptions.

## Preferences
- Short, direct responses
- Code over prose when possible
- Flag blockers early, don't spin on them
```

---

### `OPS.md` — Operational playbook

The "how to work" document. Covers task workflow, git conventions, escalation rules, and anything else the agent needs to operate effectively.

```markdown
# Operational Playbook

## Task workflow
1. Read MEMORY.md and today's log before starting any task
2. Append key learnings to today's log after completing work
3. Update MEMORY.md if the learning should persist across sessions

## Git conventions
- Branch names: `feat/`, `fix/`, `docs/` prefix
- Commit messages: imperative, 50 chars max subject
- Always create a PR — never push directly to main

## Escalation
- Use <NEED_INPUT> when blocked on a decision only the user can make
- Do NOT use <NEED_INPUT> for information you can research yourself
```

---

### `MEMORY.md` — Long-term memory index

A concise index of files in `memory/`. Each entry is one line pointing to a file and describing what's in it. The agent reads this to orient itself and decide which memory files to load.

```markdown
# Long-term Memory

- [User preferences](memory/user.md) — operator background and working style
- [Project: docs overhaul](memory/projects/docs-overhaul.md) — current doc rewrite initiative
- [2024-01-16](memory/2024-01-16.md) — completed API reference rewrite, PR #42 open
```

The `memory/` directory uses two conventions:
- **Daily logs** (`YYYY-MM-DD.md`) — append-only. Agents write to today's log at the end of each session.
- **Project docs** (`projects/<name>.md`) — persistent context for ongoing work. Updated as the project evolves.

---

### `TOOLS.md` — Environment notes

Documents the MCP tools, skills, and environment-specific information available to this agent.

```markdown
# Tools & Environment

## Available MCP tools
- **Slack** (via `mcp__slack`) — send messages, read channels
- **Linear** (via `mcp__linear`) — create/update issues

## Skills
- `/commit` — stage and commit changes with a structured message
- `/review-pr` — fetch and review a GitHub PR

## Environment
- Working directory: /workspaces/team-alpha/documentation-writer
- Repo: github.com/myorg/my-repo (branch: agent/documentation-writer)
- Server: http://localhost:3001
```

---

## Permissions file

`.claude/settings.json` controls which Claude Code tools the agent can use. This is read by the `@anthropic-ai/claude-agent-sdk` via `settingSources: ['project']`.

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "WebFetch",
      "TodoWrite"
    ]
  }
}
```

Manage permissions via the REST API or the **Permissions** tab in the AgentSidebar:

```bash
# Add a permission
POST /api/agents/:id/permissions
{ "permission": "WebSearch" }

# Remove a permission
DELETE /api/agents/:id/permissions
{ "permission": "Bash" }

# Replace all permissions
PUT /api/agents/:id/permissions
{ "allow": ["Read", "Write", "Edit"] }
```

---

## MCP configuration

`.mcp.json` configures MCP (Model Context Protocol) servers for this agent. Each server provides additional tools that appear alongside the built-in Claude Code tools.

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-..."
      }
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-linear"],
      "env": {
        "LINEAR_API_KEY": "lin_api_..."
      }
    }
  }
}
```

---

## Repo-backed agents

When an agent has a `repoUrl`, its workspace is a git worktree rather than a plain directory.

**Setup flow:**
1. `gitService` clones the repo as a bare clone into `repos/<repo-slug>/`
2. A worktree is created at `workspaces/<teamId>/<agentSlug>/` on a new branch `agent/<agentSlug>`
3. A `info/exclude` file is written inside the worktree's `.git` to prevent runtime files from being staged:

```
# workspaces/<teamId>/<agentSlug>/.git/info/exclude
.claude/
SOUL.md
USER.md
OPS.md
MEMORY.md
TOOLS.md
memory/
.mcp.json
```

This means:
- **Code changes** the agent makes are tracked in git on its branch
- **Identity and memory files** are invisible to git — they stay local, private to that agent instance

Multiple agents can work on the same repo simultaneously, each on their own branch. Merge their work via standard git operations when ready.

---

## Delegation syntax

Agents communicate with each other by emitting special XML tags in their output:

### Calling another agent

```
I'll delegate the data analysis to our analyst agent.

<CALL_AGENT name="analyst">
Please analyze the Q1 sales data from data/q1-sales.csv and return:
1. Total revenue
2. Top 3 products by margin
3. Month-over-month trend
Return a structured markdown report.
</CALL_AGENT>
```

The server intercepts this tag, looks up the agent named `analyst`, runs it with the inner prompt, and injects the result back into the delegating agent's session. Delegation depth is capped at 5 to prevent loops.

### Requesting user input

```
I need clarification before proceeding.

<NEED_INPUT>
Should I target the production or staging database for this migration?
</NEED_INPUT>
```

The server sets the agent's status to `pending` and holds. When the user replies via the ChatModal, the conversation resumes from where it paused.
