---
id: rest-api
title: REST API
sidebar_position: 1
---

# REST API

Base URL: `http://localhost:3001`

All request bodies use `Content-Type: application/json`. All inputs are validated server-side with [Zod](https://zod.dev). Invalid requests return HTTP 400 with a structured error body.

---

## Agent Templates

Manage reusable agent blueprints. Base path: `/api/templates/agents`

### `GET /api/templates/agents`

List all agent templates.

```bash
curl http://localhost:3001/api/templates/agents
```

**Response** `200 OK`:
```json
[
  {
    "id": "tmpl_abc123",
    "name": "data-analyst",
    "mission": "You are a data analyst...",
    "avatarColor": "#4f46e5",
    "repoUrl": null,
    "createdAt": "2024-01-15T10:00:00Z"
  }
]
```

---

### `POST /api/templates/agents`

Create a new agent template.

```bash
curl -X POST http://localhost:3001/api/templates/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "data-analyst",
    "mission": "You are a data analyst. When given a question, you investigate it thoroughly and return a structured report.",
    "avatarColor": "#4f46e5"
  }'
```

**Request body:**
```ts
{
  name: string;          // required, 1–64 chars, used as the agent slug
  mission: string;       // required, injected into SOUL.md
  avatarColor?: string;  // hex color, e.g. "#4f46e5"
  repoUrl?: string;      // git remote URL for repo-backed agents
}
```

**Response** `201 Created`: the created template object.

---

### `PATCH /api/templates/agents/:id`

Update template metadata.

```bash
curl -X PATCH http://localhost:3001/api/templates/agents/tmpl_abc123 \
  -H "Content-Type: application/json" \
  -d '{ "avatarColor": "#10b981" }'
```

**Request body:** any subset of the create fields (`name`, `mission`, `avatarColor`, `repoUrl`).

---

### `DELETE /api/templates/agents/:id`

Delete a template. Does not affect live agents instantiated from it.

```bash
curl -X DELETE http://localhost:3001/api/templates/agents/tmpl_abc123
```

**Response** `204 No Content`.

---

### `GET /api/templates/agents/:id/files`

Read the template's workspace files: `CLAUDE.md`, `.claude/settings.json`, commands, rules, and skills.

```bash
curl http://localhost:3001/api/templates/agents/tmpl_abc123/files
```

**Response** `200 OK`:
```json
{
  "claudeMd": "# CLAUDE.md\n...",
  "settings": "{\"permissions\":{\"allow\":[\"Bash\"]}}",
  "commands": { "commit": "# /commit skill..." },
  "rules": { "no-force-push": "Never force-push..." },
  "skills": { "analyze": "# analyze skill..." }
}
```

---

### `PUT /api/templates/agents/:id/files/claude-md`

Write the template's `CLAUDE.md`.

```bash
curl -X PUT http://localhost:3001/api/templates/agents/tmpl_abc123/files/claude-md \
  -H "Content-Type: application/json" \
  -d '{ "content": "# My Agent\n\nThis agent does X." }'
```

**Request body:**
```ts
{ content: string }
```

---

### `PUT /api/templates/agents/:id/files/settings`

Write the template's `.claude/settings.json`. The `content` field must be a valid JSON string.

```bash
curl -X PUT http://localhost:3001/api/templates/agents/tmpl_abc123/files/settings \
  -H "Content-Type: application/json" \
  -d '{ "content": "{\"permissions\":{\"allow\":[\"Bash\",\"Read\",\"Write\"]}}" }'
```

---

### `GET /api/templates/agents/:id/override-settings`

Read override settings — a JSON object merged on top of the workspace settings when the template is instantiated.

```bash
curl http://localhost:3001/api/templates/agents/tmpl_abc123/override-settings
```

**Response** `200 OK`:
```json
{
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit"]
  }
}
```

---

### `PUT /api/templates/agents/:id/override-settings`

Set override settings. The request body is the raw JSON object (not a string).

```bash
curl -X PUT http://localhost:3001/api/templates/agents/tmpl_abc123/override-settings \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": {
      "allow": ["Read", "Glob", "Grep"]
    }
  }'
```

---

### `PUT /api/templates/agents/:id/files/commands/:name`

Create or update a named command file (slash command). `:name` is the command name without the leading `/`.

```bash
curl -X PUT http://localhost:3001/api/templates/agents/tmpl_abc123/files/commands/commit \
  -H "Content-Type: application/json" \
  -d '{ "content": "# /commit\nStage all changes and commit with a structured message." }'
```

### `DELETE /api/templates/agents/:id/files/commands/:name`

Delete a command file.

---

### `PUT /api/templates/agents/:id/files/rules/:name`
### `DELETE /api/templates/agents/:id/files/rules/:name`

Manage rule files (behavioral constraints injected into the prompt).

---

### `PUT /api/templates/agents/:id/files/skills/:name`
### `DELETE /api/templates/agents/:id/files/skills/:name`

Manage skill files (reusable task templates).

---

### `POST /api/templates/agents/:id/generate-claude-md`

AI-generate a `CLAUDE.md` for this template based on its mission and optional existing content.

```bash
curl -X POST http://localhost:3001/api/templates/agents/tmpl_abc123/generate-claude-md \
  -H "Content-Type: application/json" \
  -d '{ "current": "# Existing content to improve..." }'
```

**Request body:**
```ts
{ current?: string }   // optional existing CLAUDE.md content
```

**Response** `200 OK`:
```json
{ "content": "# CLAUDE.md\n\nGenerated content..." }
```

---

### `POST /api/templates/agents/from-agent/:agentId`

Snapshot a live agent as a new template, copying its current workspace files and settings.

```bash
curl -X POST http://localhost:3001/api/templates/agents/from-agent/agent_xyz789
```

**Response** `201 Created`: the new template object.

---

## Team Templates

Manage named groups of agent templates. Base path: `/api/templates/teams`

### `GET /api/templates/teams`

List all team templates.

### `POST /api/templates/teams`

Create a team template from existing agent templates.

```bash
curl -X POST http://localhost:3001/api/templates/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Data Squad",
    "agentTemplateIds": ["tmpl_abc123", "tmpl_def456"]
  }'
```

**Request body:**
```ts
{
  name: string;
  agentTemplateIds: string[];   // existing agent template IDs
}
```

---

### `PATCH /api/templates/teams/:id`

Update team template metadata (`name`, `agentTemplateIds`).

### `DELETE /api/templates/teams/:id`

Delete the team template.

---

### `POST /api/templates/teams/:id/instantiate`

Spawn a full team from the template. Creates one live agent per agent template in the team.

```bash
curl -X POST http://localhost:3001/api/templates/teams/team_tmpl_abc/instantiate \
  -H "Content-Type: application/json" \
  -d '{ "teamId": "my-data-squad" }'
```

**Request body:**
```ts
{ teamId?: string }   // optional; auto-generated if omitted
```

**Response** `201 Created`:
```json
{
  "teamId": "my-data-squad",
  "agents": [
    { "id": "agent_111", "name": "analyst", ... },
    { "id": "agent_222", "name": "reporter", ... }
  ]
}
```

---

## Live Agents

Manage running agent instances. Base path: `/api/agents`

### `GET /api/agents`

List all live agents across all teams.

```bash
curl http://localhost:3001/api/agents
```

**Response** `200 OK`:
```json
[
  {
    "id": "agent_xyz789",
    "name": "assistant",
    "mission": "You are a helpful assistant.",
    "teamId": "default",
    "room": 0,
    "status": "idle",
    "avatarColor": "#4f46e5",
    "sessionId": "sess_abc...",
    "repoUrl": null,
    "createdAt": "2024-01-15T10:00:00Z"
  }
]
```

---

### `POST /api/agents`

Create a live agent.

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "assistant",
    "mission": "You are a helpful general-purpose assistant.",
    "teamId": "default",
    "avatarColor": "#4f46e5"
  }'
```

**Request body:**
```ts
{
  name: string;
  mission: string;
  teamId: string;
  avatarColor?: string;
  repoUrl?: string;
}
```

**Response** `201 Created`: the created agent object. Also emits `agent:created` via Socket.IO.

---

### `PATCH /api/agents/:id`

Update agent metadata.

```bash
curl -X PATCH http://localhost:3001/api/agents/agent_xyz789 \
  -H "Content-Type: application/json" \
  -d '{ "mission": "Updated mission text." }'
```

---

### `DELETE /api/agents/:id`

Delete an agent and its workspace directory.

```bash
curl -X DELETE http://localhost:3001/api/agents/agent_xyz789
```

**Response** `204 No Content`. Also emits `agent:deleted` via Socket.IO.

---

### `GET /api/agents/:id/permissions`

Read the agent's current tool allow list.

```bash
curl http://localhost:3001/api/agents/agent_xyz789/permissions
```

**Response** `200 OK`:
```json
{ "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"] }
```

---

### `PUT /api/agents/:id/permissions`

Replace the entire allow list.

```bash
curl -X PUT http://localhost:3001/api/agents/agent_xyz789/permissions \
  -H "Content-Type: application/json" \
  -d '{ "allow": ["Read", "Glob", "Grep"] }'
```

---

### `POST /api/agents/:id/permissions`

Add one permission to the allow list.

```bash
curl -X POST http://localhost:3001/api/agents/agent_xyz789/permissions \
  -H "Content-Type: application/json" \
  -d '{ "permission": "WebSearch" }'
```

---

### `DELETE /api/agents/:id/permissions`

Remove one permission from the allow list.

```bash
curl -X DELETE http://localhost:3001/api/agents/agent_xyz789/permissions \
  -H "Content-Type: application/json" \
  -d '{ "permission": "Bash" }'
```

---

### `PUT /api/agents/:id/files/settings`

Write the agent's `.claude/settings.json`. The `content` field must be a valid JSON string.

```bash
curl -X PUT http://localhost:3001/api/agents/agent_xyz789/files/settings \
  -H "Content-Type: application/json" \
  -d '{ "content": "{\"permissions\":{\"allow\":[\"Read\",\"Write\"]}}" }'
```

---

### `PUT /api/agents/:id/files/claude-md`

Write the agent's `CLAUDE.md`.

```bash
curl -X PUT http://localhost:3001/api/agents/agent_xyz789/files/claude-md \
  -H "Content-Type: application/json" \
  -d '{ "content": "# CLAUDE.md\n\nAgent-specific instructions here." }'
```

---

## Detail Views (Zoom)

High-detail snapshots for the zoom-in view. Both endpoints support `limit` / `offset` query parameters for paginating conversation history.

---

### `GET /api/rooms/:id/detail`

Full room snapshot — room grid position, the occupying agent (if any), and the agent's recent conversation messages.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `teamId` | string | `"default"` | Team that owns the room. Required for multi-team deployments because room IDs (`room-01` … `room-15`) repeat across teams. |
| `limit` | integer | `20` | Max messages to return (1–100). |
| `offset` | integer | `0` | Number of messages to skip. |

```bash
curl "http://localhost:3001/api/rooms/room-01/detail?teamId=default&limit=10&offset=0"
```

**Response** `200 OK`:
```json
{
  "room": {
    "id": "room-01",
    "gridCol": 1,
    "gridRow": 1,
    "teamId": "default"
  },
  "agent": {
    "id": "agent_xyz789",
    "name": "assistant",
    "mission": "You are a helpful assistant.",
    "avatarColor": "#4f46e5",
    "status": "sleeping",
    "roomId": "room-01",
    "teamId": "default",
    "canCreateAgents": false,
    "repoUrl": null,
    "sessionId": "sess_abc...",
    "pendingQuestion": null,
    "lastActivity": "2024-01-15T10:05:00Z",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "recentMessages": [
    { "role": "user", "content": "Summarise the Q4 report." },
    { "role": "assistant", "content": "Here is a summary…" }
  ],
  "pagination": {
    "total": 42,
    "limit": 10,
    "offset": 0
  }
}
```

`agent` is `null` when the room is unoccupied. `recentMessages` is `[]` when the agent has no conversation history.

---

### `GET /api/agents/:id/detail`

Full agent snapshot — metadata, workspace `MEMORY.md` content, paginated conversation history, and available SDK sessions.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `20` | Max history messages to return (1–100). |
| `offset` | integer | `0` | Number of messages to skip. |

```bash
curl "http://localhost:3001/api/agents/agent_xyz789/detail?limit=20&offset=0"
```

**Response** `200 OK`:
```json
{
  "agent": {
    "id": "agent_xyz789",
    "name": "assistant",
    "mission": "You are a helpful assistant.",
    "avatarColor": "#4f46e5",
    "status": "working",
    "roomId": "room-01",
    "teamId": "default",
    "canCreateAgents": false,
    "repoUrl": null,
    "sessionId": "sess_abc...",
    "pendingQuestion": null,
    "lastActivity": "2024-01-15T10:05:00Z",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "memory": {
    "content": "# Long-term Memory\n\nKey facts the agent has learned…"
  },
  "history": {
    "messages": [
      { "role": "user", "content": "Analyse the dataset." },
      { "role": "assistant", "content": "I'll start by…" }
    ],
    "pagination": {
      "total": 84,
      "limit": 20,
      "offset": 0
    }
  },
  "sessions": [
    { "sessionId": "sess_abc...", "createdAt": "2024-01-15T10:00:00Z" },
    { "sessionId": "sess_def...", "createdAt": "2024-01-14T08:00:00Z" }
  ]
}
```

`memory.content` is `null` when no `MEMORY.md` exists in the agent's workspace. `sessions` lists all persisted SDK sessions for the agent's workspace directory.
