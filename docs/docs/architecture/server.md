---
id: server
title: Server
sidebar_position: 2
---

# Server Architecture

The server is an Express + Socket.IO application written in TypeScript (ESM), running under `tsx watch` for hot-reload in development. All source files are in `server/src/`.

## Entry point

`server/src/index.ts` bootstraps the application:
1. Creates the Express app and HTTP server
2. Attaches Socket.IO
3. Registers all routers (each is a factory `createXRouter(io)`)
4. Calls `agentService.loadAllAgents()` to restore state from disk
5. Calls `cronService.init()` to register scheduled jobs
6. Starts listening on `PORT` (default: 3001)

## Services

### `agentService.ts`

Central registry for all agents. The single source of truth for in-memory state.

```ts
// Internal storage
const agents = new Map<string, Agent>();

// All mutations end with:
function persist(teamId: string): void {
  fs.writeFileSync(
    `workspaces/${teamId}/agents.json`,
    JSON.stringify([...agents.values()].filter(a => a.teamId === teamId), null, 2)
  );
}
```

Key functions:

| Function | Description |
|----------|-------------|
| `createAgent(data)` | Creates workspace, assigns room, persists |
| `deleteAgent(id)` | Removes from map, deletes workspace, persists |
| `updateAgent(id, patch)` | Patches agent fields, persists |
| `loadAllAgents()` | Reads all `workspaces/*/agents.json` on startup |
| `restoreAgent(data)` | Re-inserts a loaded agent into the map |
| `getAgent(id)` | Returns agent or throws |
| `getAgentsByTeam(teamId)` | Lists agents for a team |

### `claudeService.ts`

Executes agent tasks via the Anthropic SDK. The most complex service.

**System prompt construction** — `buildSystemPromptAppend(agent)`:

```ts
function buildSystemPromptAppend(agent: Agent): string {
  const workspace = readWorkspaceFiles(agent); // SOUL.md, USER.md, OPS.md, MEMORY.md, TOOLS.md
  return `
# Agent Identity
${workspace.soul}

# Operator Context
${workspace.user}

# Operational Playbook
${workspace.ops}

# Long-term Memory Index
${workspace.memory}

# Tools & Environment
${workspace.tools}

# Delegation Protocol
To delegate to another agent: <CALL_AGENT name="agentName">task description</CALL_AGENT>
To request user input: <NEED_INPUT>your question here</NEED_INPUT>

${agent.canCreateAgents ? '# Agent Creation\nYou can create new agents via the REST API.' : ''}
`.trim();
}
```

**Task execution** — `runTask(agentId, message, depth)`:

```ts
async function runTask(agentId: string, message: string, depth = 0): Promise<string> {
  const agent = agentService.getAgent(agentId);

  agentService.updateAgent(agentId, { status: 'running' });
  io.emit('agent:statusChanged', { id: agentId, status: 'running' });

  const result = await query({
    model: 'claude-sonnet-4-6',
    prompt: message,
    systemPrompt: buildSystemPromptAppend(agent),
    permissionMode: 'acceptEdits',
    settingSources: ['project'],
    cwd: agent.workspacePath,
    resumeSession: agent.sessionId,
    maxTurns: 200,
    onStream: (chunk) => io.emit('agent:stream', { id: agentId, chunk }),
    onToolCall: (tool, input) => io.emit('agent:toolCall', { id: agentId, tool, input }),
    onToolResult: (tool, result) => io.emit('agent:toolResult', { id: agentId, tool, result }),
  });

  // Persist session ID for resumability
  agentService.updateAgent(agentId, { sessionId: result.sessionId, status: 'idle' });

  // Scan output for delegation or input requests
  return processOutput(result.output, agentId, depth);
}
```

**Inter-agent delegation** — detected by scanning the completed output:

```ts
const CALL_AGENT_RE = /<CALL_AGENT name="([^"]+)">([\s\S]*?)<\/CALL_AGENT>/g;

async function processOutput(output: string, fromId: string, depth: number): Promise<string> {
  if (depth >= 5) return output; // hard limit

  const match = CALL_AGENT_RE.exec(output);
  if (!match) return output;

  const [full, toName, prompt] = match;
  const toAgent = agentService.getAgentByName(toName);

  io.emit('agent:delegating', { fromId, toName, prompt });
  const delegateResult = await runTask(toAgent.id, prompt, depth + 1);
  io.emit('agent:delegationComplete', { fromId, toName, result: delegateResult });

  // Replace the tag with the result and continue processing
  return processOutput(output.replace(full, delegateResult), fromId, depth);
}
```

**User input requests** — `<NEED_INPUT>` handling:

```ts
const NEED_INPUT_RE = /<NEED_INPUT>([\s\S]*?)<\/NEED_INPUT>/;

function checkForInputRequest(output: string, agentId: string): void {
  const match = NEED_INPUT_RE.exec(output);
  if (match) {
    agentService.updateAgent(agentId, { status: 'pending', pendingQuestion: match[1] });
    io.emit('agent:statusChanged', { id: agentId, status: 'pending' });
  }
}
```

### `persistenceService.ts`

Thin wrappers around `fs.readFileSync` / `fs.writeFileSync` with JSON parsing. Each file has a dedicated read/write pair:

| File | Read | Write |
|------|------|-------|
| `workspaces/<teamId>/agents.json` | `loadAgents(teamId)` | `saveAgents(teamId, agents)` |
| `workspaces/templates.json` | `loadTemplates()` | `saveTemplates(templates)` |
| `workspaces/schedules.json` | `loadSchedules()` | `saveSchedules(schedules)` |
| `workspaces/skills.json` | `loadSkills()` | `saveSkills(skills)` |

All files are created with an empty array `[]` if they don't exist.

### `roomService.ts`

Manages the 5×3 room grid per team. Rooms are integers 0–14. On agent creation, finds the lowest unoccupied room. On deletion, marks the room free.

```ts
function assignRoom(teamId: string): number {
  const occupied = getOccupiedRooms(teamId);
  for (let i = 0; i < 15; i++) {
    if (!occupied.has(i)) return i;
  }
  throw new Error('No rooms available');
}
```

### `fileService.ts`

Sets up and reads agent workspace files.

```ts
// Called on agent creation
async function setupWorkspaceStructure(agent: Agent): Promise<void> {
  await fs.mkdir(agent.workspacePath, { recursive: true });
  await fs.mkdir(path.join(agent.workspacePath, 'memory'), { recursive: true });
  await fs.mkdir(path.join(agent.workspacePath, '.claude'), { recursive: true });

  await fs.writeFile(path.join(agent.workspacePath, 'SOUL.md'), generateSoul(agent));
  await fs.writeFile(path.join(agent.workspacePath, 'USER.md'), generateUser(agent));
  await fs.writeFile(path.join(agent.workspacePath, 'OPS.md'), generateOps(agent));
  await fs.writeFile(path.join(agent.workspacePath, 'MEMORY.md'), generateMemory(agent));
  await fs.writeFile(path.join(agent.workspacePath, 'TOOLS.md'), generateTools(agent));
  await fs.writeFile(path.join(agent.workspacePath, '.claude/settings.json'), generateSettings(agent));
  await fs.writeFile(path.join(agent.workspacePath, '.mcp.json'), generateMcp(agent));
}
```

### `gitService.ts`

Manages git worktrees for repo-backed agents:

```bash
# On agent creation (simplified)
git clone --bare <repoUrl> repos/<repoSlug>/
git -C repos/<repoSlug>/ worktree add \
  workspaces/<teamId>/<agentSlug>/ \
  -b agent/<agentSlug>
```

Runtime files are excluded from git tracking via the worktree's `info/exclude`:

```
# Added automatically — never committed
.claude/
SOUL.md
USER.md
OPS.md
MEMORY.md
TOOLS.md
memory/
.mcp.json
```

### `cronService.ts`

On startup, reads `workspaces/schedules.json` and registers `node-cron` jobs:

```ts
function init(): void {
  const schedules = persistenceService.loadSchedules();
  for (const schedule of schedules) {
    cron.schedule(schedule.cron, () => {
      claudeService.runTask(schedule.agentId, schedule.message);
    });
  }
}
```

When a job fires, it takes the same code path as a user message. Output streams to the browser and appears in the agent's conversation history.

## Routing pattern

Every router is a factory function that takes the Socket.IO server instance:

```ts
export function createAgentsRouter(io: Server): Router {
  const router = Router();

  router.get('/', (req, res) => { /* list agents */ });
  router.post('/', async (req, res) => { /* create agent, emit agent:created */ });

  return router;
}
```

[Zod](https://zod.dev) validates all request bodies. Invalid requests return 400 with a structured error.

```ts
const createAgentSchema = z.object({
  name: z.string().min(1).max(64),
  mission: z.string().min(1),
  teamId: z.string(),
  avatarColor: z.string().optional(),
  repoUrl: z.string().url().optional(),
});
```
