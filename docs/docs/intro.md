---
id: intro
title: Introduction
sidebar_position: 1
---

<div style={{textAlign: 'center', margin: '2rem 0 2.5rem'}}>
  <img src="/img/tonkatsu.png" alt="Tonkatsu" style={{height: '140px', borderRadius: '0.75rem'}} />
  <h1 style={{fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginTop: '1rem', marginBottom: '0.25rem'}}>Tonkatsu</h1>
  <p style={{fontSize: '1.1rem', opacity: 0.6, marginBottom: 0}}>A virtual office for Claude Code agents</p>
</div>

**Tonkatsu** is a self-hosted platform where multiple AI agents run autonomously in named rooms, collaborate in real time, and delegate tasks to each other — all powered by the Anthropic Claude API.

## What is it?

Think of it as a physical office, but for AI. Each agent occupies a room on a 5×3 grid, has a persistent workspace on disk, and can chat with users or hand work off to other agents. Agents are powered by `claude-sonnet-4-6` via the `@anthropic-ai/claude-agent-sdk`, running with `permissionMode: 'acceptEdits'` so they can take real actions — reading files, running code, calling APIs — without constant manual approval.

Every agent has its own identity defined by a set of markdown files in its workspace: a `SOUL.md` that describes its personality and mission, a `USER.md` with context about the operator, an `OPS.md` playbook for how it should work, a `MEMORY.md` index of long-term knowledge, and a `TOOLS.md` describing its capabilities. These files are injected into the system prompt on each run, giving each agent a stable, coherent identity across conversations.

## How it works

```
User sends message
       │
       ▼
Socket.IO → claudeService.query()
       │
       ▼
Anthropic API (claude-sonnet-4-6, up to 200 turns)
       │
       ├─ streams text chunks → agent:stream → browser
       ├─ emits tool calls   → agent:toolCall → browser
       │
       └─ output contains <CALL_AGENT name="X">?
              │ yes
              ▼
         recursive call to agent X (max depth 5)
              │
              ▼
         result injected back into original session
```

When an agent needs human input, it emits `<NEED_INPUT>your question</NEED_INPUT>` in its output. The server sets the agent's status to `pending` and waits. When an agent completes its task, it returns to `idle`. All state is persisted to JSON files so the server can be restarted without losing context.

## Key features

| Feature | Details |
|---------|---------|
| **Multi-agent rooms** | Agents live in a 5×3 visual grid. See who's running, idle, pending, or sleeping at a glance. Click any room to open a chat. |
| **Real-time streaming** | Text, tool calls, and delegation events stream live to the browser via Socket.IO. No polling, no refresh. |
| **Inter-agent delegation** | Agents call each other with `<CALL_AGENT name="X">task</CALL_AGENT>`. Up to 5 levels deep, with full traceability in the UI. |
| **Persistent sessions** | SDK session IDs are stored in `agents.json`. Conversations resume across server restarts without losing context. |
| **Repo-backed agents** | Tie an agent to a git repo. It gets its own branch + worktree; code changes are tracked, identity files stay private. |
| **Templates** | Snapshot any live agent or team into a reusable template. Reinstantiate with one API call. |
| **Cron schedules** | Schedule agents to run tasks on a cron expression. Daily standups, monitoring, data sync — fully automated. |
| **Skill library** | A shared library of reusable skill files. Inject the right skills into each agent's prompt. |
| **Workspace sync** | SSH-based sync to push/pull agent workspaces to remote machines. |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Zustand |
| Backend | Node.js, Express, Socket.IO, TypeScript (ESM) |
| AI | Anthropic Claude `claude-sonnet-4-6`, `@anthropic-ai/claude-agent-sdk` |
| Persistence | JSON files on disk — no database, no migrations |
| Git | Per-agent branches and worktrees for repo-backed workspaces |
