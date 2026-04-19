---
id: overview
title: Overview
sidebar_position: 1
---

# How Tonkatsu Works

This page explains the big picture — how the pieces fit together, what happens when you send a message, and why things are built the way they are. No technical background required for the first half.

## The big picture

Tonkatsu has three main parts:

```
Your browser  ←→  The server  ←→  Anthropic AI
```

- **Your browser** shows the office grid, chat windows, and live streaming output
- **The server** runs on your machine, manages assistants, and talks to the AI
- **Anthropic AI** is the intelligence behind every assistant — it thinks, writes, and decides what to do next

When you type a message to an assistant, it flows right to left and back:

1. Your browser sends the message to the server
2. The server sends it to the Anthropic AI
3. The AI starts generating a response — word by word
4. Each word streams back through the server to your browser in real time
5. When a tool is used (reading a file, running a command), that also appears live
6. When done, the assistant goes back to idle

## What happens during delegation

Assistants can hand tasks to other assistants. Here's what that looks like from the inside:

1. An assistant finishes writing its response — and it includes a delegation tag
2. The server spots the tag and pauses that assistant
3. The server sends the subtask to the target assistant
4. The target assistant works, streams its output, finishes
5. The result is fed back to the first assistant, which continues
6. The whole chain can be up to 5 levels deep

You see all of this live in the browser — delegation badges, streaming output from each assistant in sequence.

## How assistants remember things

Assistants keep their memory in plain files on disk:

- At the end of each task, an assistant can write notes to its `memory/` folder
- Next time it runs, it reads those notes and picks up where it left off
- Session IDs are saved too — if the server restarts, assistants resume their last conversation automatically

## The office grid

Each team gets a 5×3 grid — 15 rooms. Each room can hold one assistant. The grid is purely visual: rooms don't affect how assistants work, but they make it easy to orient yourself when you have many assistants running at once.

## Why no database?

All data is stored as plain JSON files and markdown on disk. This means:

- No database to install, configure, or maintain
- Easy to inspect, back up, or move — just copy the folder
- The server restarts cleanly with no migration steps

The trade-off is that you can't run multiple server instances pointing at the same data (unless you use a shared network drive — see [Deployment → Scaling](../deployment#scaling)).

---

## Technical detail (for developers)

### Codebase layout

```
tonkatsu/
├── client/       # React 19 + Vite frontend
├── server/       # Express + Socket.IO backend (ESM TypeScript)
├── docs/         # This documentation site
├── workspaces/   # Agent data on disk (not in git)
└── repos/        # Bare git clones for repo-backed agents (not in git)
```

### Request flow

```
Browser
  │  Socket.IO (WebSocket)
  ▼
Express + Socket.IO server
  │
  ├── agentService (in-memory Map<id, Agent>)
  │
  └── claudeService
        │  @anthropic-ai/claude-agent-sdk query()
        │  permissionMode: 'acceptEdits'
        │  settingSources: ['project']
        │  model: claude-sonnet-4-6, max 200 turns
        ▼
      Anthropic API
        │  streams tokens
        ▼
      agent:stream events → browser
```

### Agent lifecycle

```
create → setupWorkspace → assign room → persist → [restart?] → restore → runTask → persist sessionId
```

### Key design decisions

| Decision | Why |
|----------|-----|
| No database | Simple, portable, no migrations, easy to inspect |
| In-memory agent map | O(1) lookups; disk is source of truth, memory is cache |
| Socket.IO for everything real-time | One connection handles streaming, status, tools, delegations |
| ESM TypeScript | Native modules on both client and server |
| `acceptEdits` mode | Agents act without per-tool-call approval; permissions controlled via `settings.json` |
