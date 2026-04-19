---
id: socket-events
title: Socket.IO Events
sidebar_position: 2
---

# Socket.IO Events

Tonkatsu uses Socket.IO for all real-time communication. Connect to `http://localhost:3001`.

## Connecting

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('connected:', socket.id);
});
```

On connect, the server immediately emits `agent:list` and `team:list` with current state.

---

## Server → Client events

These events are emitted by the server and received in the browser.

### `agent:list`

Full agent list, sent on connect and after bulk state changes.

```ts
socket.on('agent:list', (agents: Agent[]) => {
  // Replace local agent state entirely
  store.setAgents(agents);
});
```

**Payload:** `Agent[]` — array of all live agents.

---

### `agent:created`

A new agent was created.

```ts
socket.on('agent:created', (agent: Agent) => {
  store.upsertAgent(agent);
});
```

**Payload:**
```ts
{
  id: string;
  name: string;
  mission: string;
  teamId: string;
  room: number;         // 0–14
  status: AgentStatus;
  avatarColor: string;
  sessionId: string | null;
  repoUrl: string | null;
  createdAt: string;    // ISO 8601
}
```

---

### `agent:updated`

Agent metadata changed (name, mission, color, etc.).

```ts
socket.on('agent:updated', (agent: Agent) => {
  store.upsertAgent(agent);
});
```

**Payload:** same shape as `agent:created`.

---

### `agent:deleted`

An agent was deleted.

```ts
socket.on('agent:deleted', ({ id }: { id: string }) => {
  store.removeAgent(id);
});
```

---

### `team:list`

Full team list.

```ts
socket.on('team:list', (teams: Team[]) => {
  store.setTeams(teams);
});
```

**Payload:** `Team[]`

---

### `agent:statusChanged`

Agent execution status changed.

```ts
socket.on('agent:statusChanged', ({ id, status }: { id: string; status: AgentStatus }) => {
  store.updateAgentStatus(id, status);
});
```

**Payload:**
```ts
{
  id: string;
  status: 'idle' | 'running' | 'pending' | 'sleeping';
}
```

| Status | Meaning |
|--------|---------|
| `idle` | Ready for a new task |
| `running` | Actively executing — SDK query in progress |
| `pending` | Waiting for user input (`<NEED_INPUT>` detected in output) |
| `sleeping` | Manually paused |

---

### `agent:stream`

A streaming text chunk from the agent's current response.

```ts
socket.on('agent:stream', ({ id, chunk }: { id: string; chunk: string }) => {
  store.appendToStream(id, chunk);
});
```

**Payload:**
```ts
{ id: string; chunk: string }
```

Chunks arrive in order. Accumulate them to reconstruct the full response. The buffer is cleared when a new task starts (`agent:sendMessage`).

---

### `agent:history`

Full conversation history for an agent. Sent when you subscribe to an agent or request history explicitly.

```ts
socket.on('agent:history', ({ id, messages }: { id: string; messages: Message[] }) => {
  store.setHistory(id, messages);
});
```

**Payload:**
```ts
{
  id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}
```

---

### `agent:message`

A complete (non-streaming) message from the agent. Used for scheduled task completions and delegated responses.

```ts
socket.on('agent:message', ({ id, message }: { id: string; message: Message }) => {
  store.appendMessage(id, message);
});
```

---

### `agent:toolCall`

The agent invoked a tool.

```ts
socket.on('agent:toolCall', ({ id, tool, input }: ToolCallEvent) => {
  store.addToolEvent(id, { type: 'call', tool, input });
});
```

**Payload:**
```ts
{
  id: string;    // agent ID
  tool: string;  // tool name, e.g. "Bash", "Read", "WebSearch"
  input: Record<string, unknown>;  // tool arguments
}
```

**Example:**
```json
{
  "id": "agent_xyz789",
  "tool": "Bash",
  "input": { "command": "git log --oneline -10" }
}
```

---

### `agent:toolResult`

A tool returned a result.

```ts
socket.on('agent:toolResult', ({ id, tool, result }: ToolResultEvent) => {
  store.addToolEvent(id, { type: 'result', tool, result });
});
```

**Payload:**
```ts
{
  id: string;
  tool: string;
  result: unknown;  // string for most tools, object for structured responses
}
```

---

### `agent:sessions`

List of saved sessions for an agent. Sent in response to `agent:listSessions`.

```ts
socket.on('agent:sessions', ({ id, sessions }: { id: string; sessions: Session[] }) => {
  store.setSessions(id, sessions);
});
```

**Payload:**
```ts
{
  id: string;
  sessions: Array<{
    sessionId: string;
    startedAt: string;
    lastActiveAt: string;
    messageCount: number;
  }>;
}
```

---

### `agent:delegating`

An agent is delegating a task to another agent.

```ts
socket.on('agent:delegating', ({ fromId, toName, prompt }) => {
  store.addDelegationEvent({ fromId, toName, prompt, type: 'start' });
});
```

**Payload:**
```ts
{
  fromId: string;   // delegating agent's ID
  toName: string;   // target agent's name
  prompt: string;   // the delegated task text
}
```

---

### `agent:delegationComplete`

A delegation finished and the result was returned to the calling agent.

```ts
socket.on('agent:delegationComplete', ({ fromId, toName, result }) => {
  store.addDelegationEvent({ fromId, toName, result, type: 'complete' });
});
```

**Payload:**
```ts
{
  fromId: string;
  toName: string;
  result: string;   // the delegated agent's output
}
```

---

## Client → Server events

These events are emitted by the browser and handled by the server.

### `agent:subscribe`

Subscribe to live updates for a specific agent. After subscribing, the server sends `agent:history` with the agent's current conversation.

```ts
socket.emit('agent:subscribe', { id: 'agent_xyz789' });
```

---

### `agent:unsubscribe`

Unsubscribe from updates for an agent. Call this when the ChatModal closes.

```ts
socket.emit('agent:unsubscribe', { id: 'agent_xyz789' });
```

---

### `agent:sendMessage`

Send a message to an agent. Clears the stream buffer and sets status to `running`.

```ts
socket.emit('agent:sendMessage', {
  id: 'agent_xyz789',
  message: 'Analyze the Q1 sales report and summarize the top 3 findings.',
});
```

**Payload:**
```ts
{ id: string; message: string }
```

---

### `agent:sleep`

Put an agent to sleep. Sets status to `sleeping`.

```ts
socket.emit('agent:sleep', { id: 'agent_xyz789' });
```

---

### `agent:newConversation`

Clear the agent's conversation history and start fresh. Clears the stored `sessionId` so the next task starts a new Claude session.

```ts
socket.emit('agent:newConversation', { id: 'agent_xyz789' });
```

---

### `team:newConversation`

Start fresh conversations for all agents in a team at once.

```ts
socket.emit('team:newConversation', { teamId: 'default' });
```

---

### `agent:listSessions`

Request the list of saved sessions for an agent. The server responds with `agent:sessions`.

```ts
socket.emit('agent:listSessions', { id: 'agent_xyz789' });

socket.on('agent:sessions', ({ id, sessions }) => {
  console.log('sessions for', id, sessions);
});
```

---

### `agent:resumeSession`

Resume a specific previous session by ID. The agent's next message will continue from that session's context.

```ts
socket.emit('agent:resumeSession', {
  id: 'agent_xyz789',
  sessionId: 'sess_abc123',
});
```

---

### `agent:moveRoom`

Move an agent to a different room on the grid.

```ts
socket.emit('agent:moveRoom', {
  id: 'agent_xyz789',
  room: 7,   // integer 0–14
});
```

---

## Full example: subscribe and chat

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');
const agentId = 'agent_xyz789';

// On connect, server sends agent:list and team:list automatically
socket.on('agent:list', (agents) => console.log('agents:', agents.length));

// Subscribe to a specific agent
socket.emit('agent:subscribe', { id: agentId });

// Receive conversation history
socket.on('agent:history', ({ id, messages }) => {
  if (id === agentId) console.log('history loaded:', messages.length, 'messages');
});

// Stream the response
let buffer = '';
socket.on('agent:stream', ({ id, chunk }) => {
  if (id === agentId) {
    buffer += chunk;
    process.stdout.write(chunk);
  }
});

// Watch for tool calls
socket.on('agent:toolCall', ({ id, tool, input }) => {
  if (id === agentId) console.log(`\n[tool] ${tool}`, input);
});

// Watch for delegations
socket.on('agent:delegating', ({ fromId, toName }) => {
  console.log(`\n[delegation] ${fromId} → ${toName}`);
});

// Status changes
socket.on('agent:statusChanged', ({ id, status }) => {
  if (id === agentId) console.log(`\n[status] ${status}`);
});

// Send a message
socket.emit('agent:sendMessage', {
  id: agentId,
  message: 'What files are in the current directory?',
});
```
