---
id: overview
title: Overview
sidebar_position: 1
---

# Architecture Overview

Tonkatsu is a monorepo with two npm workspaces and a shared disk layout for agent state:

```
tonkatsu/
├── client/       # React 19 + Vite frontend
├── server/       # Express + Socket.IO backend (ESM TypeScript)
├── docs/         # This Docusaurus site
├── workspaces/   # Agent workspaces on disk (not in git)
└── repos/        # Bare git clones for repo-backed agents (not in git)
```

## System diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Zustand)                                │
│  ┌──────────┐  ┌────────────┐  ┌────────┐  ┌────────────┐  │
│  │OfficeMap │  │ ChatModal  │  │  HUD   │  │AgentSidebar│  │
│  └────┬─────┘  └─────┬──────┘  └───┬────┘  └─────┬──────┘  │
│       └──────────────┴─────────────┴──────────────┘         │
│                          │ Zustand                           │
│               ┌──────────┴──────────┐                       │
│               │ agentStore          │ socketStore            │
│               └─────────────────────┘                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ Socket.IO (ws://)
                           │ HTTP REST (/api/*)
┌──────────────────────────┴──────────────────────────────────┐
│  Express + Socket.IO Server (Node.js, ESM TypeScript)        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ agentService│  │claudeService │  │persistenceService│   │
│  │ (in-memory  │  │(SDK query()) │  │ (JSON file I/O)  │   │
│  │  Map<id,    │◄─┤              │  │                  │   │
│  │  Agent>)    │  │ buildSystem  │  │ agents.json      │   │
│  └──────┬──────┘  │ PromptAppend │  │ templates.json   │   │
│         │         └──────┬───────┘  │ schedules.json   │   │
│  ┌──────┴──────┐         │          │ skills.json      │   │
│  │ roomService │         │          └──────────────────┘   │
│  │ (5×3 grid)  │         │                                  │
│  └─────────────┘         │                                  │
└─────────────────────────┬┘──────────────────────────────────┘
                          │ HTTPS
              ┌───────────┴───────────┐
              │  Anthropic API        │
              │  claude-sonnet-4-6    │
              │  @anthropic-ai/       │
              │  claude-agent-sdk     │
              └───────────────────────┘
```

## Request flow

A typical user-initiated message goes through these steps:

1. User types a message in **ChatModal** → `socketStore.sendMessage()` emits `agent:sendMessage`
2. Server receives the event → `agentService` looks up the agent → calls `claudeService.runTask()`
3. `claudeService` calls `query()` from `@anthropic-ai/claude-agent-sdk` with the built system prompt
4. The SDK streams tokens back → server emits `agent:stream` events → browser appends to `streamBuffers`
5. Tool calls: `agent:toolCall` event fires when the agent invokes a tool; `agent:toolResult` when it returns
6. Delegation: if the agent output contains `<CALL_AGENT name="X">…</CALL_AGENT>`, the server recursively calls agent X and injects the result
7. On completion: agent status → `idle`, final content appended to conversation history, `agents.json` updated

## Agent lifecycle

```
create agent
     │
     ▼
fileService.setupWorkspaceStructure()
     │  writes SOUL.md, USER.md, OPS.md, MEMORY.md, TOOLS.md
     ▼
agentService.addAgent()
     │  inserts into in-memory Map
     │  persist() → agents.json
     ▼
[server restarts?]
     │
     ▼
agentService.loadAllAgents()
     │  reads agents.json
     ▼
agentService.restoreAgent()
     │  rebuilds Map entry
     │  resumes last SDK session (if sessionId stored)
     ▼
user sends message
     │
     ▼
claudeService.runTask()
     │  status → running
     │  calls query() with permissionMode: 'acceptEdits'
     │  max 200 turns per task
     │
     ├── streams → agent:stream events
     ├── tool calls → agent:toolCall / agent:toolResult
     ├── <CALL_AGENT> → recursive delegation (max depth 5)
     └── <NEED_INPUT> → status: pending (waits for user reply)
     │
     ▼
status → idle, session ID persisted
```

## The 5×3 room grid

Each team gets a 5×3 grid of 15 rooms. Rooms are identified by index (0–14) and managed by `roomService.ts`. When an agent is created, it's assigned the first available room. Agents can be moved via the `agent:moveRoom` socket event or the REST API.

The grid is purely visual — rooms don't affect how agents execute tasks. They're a UX device for orienting users in teams with many agents.

## Session persistence across restarts

When `claudeService` completes a task, it stores the SDK session ID in the agent's record in `agents.json`. On the next `runTask()` call, if a session ID is present, it's passed to `query()` as `resumeSession`. This lets the agent pick up where it left off — maintaining context across server restarts without re-uploading conversation history.

If you explicitly call `agent:newConversation`, the session ID is cleared and a fresh conversation starts.

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| **No database** | All state lives in JSON files. Simple, portable, no migrations, easy to inspect and edit. Suitable for self-hosted team use. |
| **In-memory agent map** | Fast O(1) lookups. Rebuilt from disk on startup — disk is the source of truth, memory is the cache. |
| **Socket.IO for real-time** | Streaming, status changes, tool events, and delegations all use a single WebSocket connection. |
| **ESM TypeScript** | Both client and server use native ES modules. Avoids CommonJS interop headaches. |
| **`acceptEdits` permission mode** | Agents can take real actions (edit files, run commands) without prompting for each tool call. The operator controls which tools are allowed via `settings.json`. |
| **`settingSources: ['project']`** | Agent tool permissions are read from the workspace `.claude/settings.json`, giving fine-grained per-agent control. |
