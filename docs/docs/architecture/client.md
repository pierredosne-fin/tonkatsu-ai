---
id: client
title: Client
sidebar_position: 3
---

# Client Architecture

The client is a React 19 + TypeScript application bundled with Vite. All source files are in `client/src/`.

## State management

Two Zustand stores own all client state. There is no Redux, no React context for data — Zustand handles everything.

### `agentStore`

The domain store. Holds all agent and team data. Updated by `socketStore` handlers in response to server events.

```ts
interface AgentStore {
  agents: Agent[];
  teams: Team[];
  streamBuffers: Record<string, string>;      // agentId → accumulated stream text
  toolEvents: Record<string, ToolEvent[]>;    // agentId → tool call/result history
  delegationEvents: DelegationEvent[];        // cross-agent delegation log
  conversationHistory: Record<string, Message[]>; // agentId → message history

  // Actions
  setAgents: (agents: Agent[]) => void;
  upsertAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  appendStream: (id: string, chunk: string) => void;
  clearStream: (id: string) => void;
  addToolEvent: (id: string, event: ToolEvent) => void;
  addDelegationEvent: (event: DelegationEvent) => void;
  setHistory: (id: string, messages: Message[]) => void;
}
```

Stream chunks accumulate in `streamBuffers[agentId]` until the next task starts, at which point `clearStream(id)` resets the buffer and streaming begins fresh.

### `socketStore`

Manages the Socket.IO connection lifecycle and all event dispatch.

```ts
interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;

  // Emit helpers
  sendMessage: (agentId: string, message: string) => void;
  sleepAgent: (agentId: string) => void;
  newConversation: (agentId: string) => void;
  teamNewConversation: (teamId: string) => void;
  subscribeAgent: (agentId: string) => void;
  unsubscribeAgent: (agentId: string) => void;
  listSessions: (agentId: string) => void;
  resumeSession: (agentId: string, sessionId: string) => void;
  moveRoom: (agentId: string, room: number) => void;
}
```

`connect()` is called once (in the root component) and registers all server→client event handlers:

```ts
function connect() {
  const socket = io('http://localhost:3001');

  socket.on('agent:list', (agents) => agentStore.setAgents(agents));
  socket.on('agent:created', (agent) => agentStore.upsertAgent(agent));
  socket.on('agent:updated', (agent) => agentStore.upsertAgent(agent));
  socket.on('agent:deleted', ({ id }) => agentStore.removeAgent(id));
  socket.on('agent:statusChanged', ({ id, status }) => agentStore.updateStatus(id, status));
  socket.on('agent:stream', ({ id, chunk }) => agentStore.appendStream(id, chunk));
  socket.on('agent:history', ({ id, messages }) => agentStore.setHistory(id, messages));
  socket.on('agent:toolCall', ({ id, tool, input }) => agentStore.addToolEvent(id, { type: 'call', tool, input }));
  socket.on('agent:toolResult', ({ id, tool, result }) => agentStore.addToolEvent(id, { type: 'result', tool, result }));
  socket.on('agent:delegating', (event) => agentStore.addDelegationEvent({ ...event, type: 'start' }));
  socket.on('agent:delegationComplete', (event) => agentStore.addDelegationEvent({ ...event, type: 'complete' }));

  set({ socket, connected: true });
}
```

## Component tree

```
App
├── TeamTabs            — switch between teams
├── OfficeMap           — 5×3 room grid
│   └── Room (×15)      — individual room cell
│       ├── AgentAvatar — colored dot + status indicator
│       └── [onClick]   → opens ChatModal or AgentSidebar
├── HUD                 — top-right team controls
│   ├── NewAgentButton
│   ├── SleepAllButton
│   ├── NewConversationButton
│   └── TemplatesPanel
├── AgentSidebar        — slides in on agent selection
│   ├── MissionTab      — view/edit mission + identity files
│   ├── FilesTab        — browse workspace files
│   ├── PermissionsTab  — manage allowed tools
│   └── ScheduleModal   — cron schedule management
├── ChatModal           — full chat interface (opens on room click)
│   ├── MessageList     — conversation history + streaming output
│   ├── ToolCallList    — collapsible tool call/result pairs
│   ├── DelegationBadge — shows when agent is delegating
│   └── MessageInput    — text input + send button
└── WorkspaceSyncModal  — SSH-based workspace sync configuration
```

## Key components

### `OfficeMap`

Renders a CSS grid with 5 columns and 3 rows. Each cell maps to a `Room` component. Agents are matched to rooms by their `room` field (integer 0–14).

```tsx
function OfficeMap() {
  const agents = useAgentStore(s => s.agents);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
      {Array.from({ length: 15 }, (_, i) => {
        const agent = agents.find(a => a.room === i);
        return <Room key={i} index={i} agent={agent} />;
      })}
    </div>
  );
}
```

### `ChatModal`

The main interaction surface. Opens when you click an agent's room. Displays:
- Conversation history (from `conversationHistory[agentId]`)
- Live streaming text (from `streamBuffers[agentId]`)
- Tool call/result pairs (from `toolEvents[agentId]`)
- A delegation badge when `agent:delegating` fires

On mount, emits `agent:subscribe` and `agent:history`. On unmount, emits `agent:unsubscribe`.

### `HUD`

Team-level controls rendered as a fixed overlay. The most-used buttons:

| Button | Socket event emitted |
|--------|---------------------|
| New Conversation | `team:newConversation` |
| Sleep All | `agent:sleep` for each agent |
| + New Agent | Opens `CreateAgentModal` |

### `WorkspaceSyncModal`

Configures SSH-based workspace sync. Stores SSH key and remote host in `.sync-data/` (never committed). Provides buttons to push/pull agent workspaces to a remote server.

## Real-time event flow

```
Socket.IO event arrives
        │
        ▼
socketStore handler called
        │
        ▼
agentStore action called (Zustand setState)
        │
        ▼
React components subscribed via useAgentStore() re-render
```

Because Zustand uses shallow comparison by default, only components that subscribe to the specific slice of state that changed will re-render. `streamBuffers` updates (high frequency during streaming) only trigger re-renders in `ChatModal`, not in `OfficeMap`.
