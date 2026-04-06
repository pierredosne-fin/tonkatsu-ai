import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT } from './config.js';
import { createAgentRouter, createRoomsRouter, createTeamsRouter } from './routes/agents.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { createTemplatesRouter } from './routes/templates.js';
import { registerHandlers } from './socket/handlers.js';
import { loadAllAgents, scanAllWorkspaceAgents } from './services/persistenceService.js';
import { restoreAgent, createAgent, getAllAgents } from './services/agentService.js';
import { loadAllTemplates } from './services/templateService.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.use('/api/agents', createAgentRouter(io));
app.use('/api/rooms', createRoomsRouter());
app.use('/api/teams', createTeamsRouter(io));
app.use('/api/workspaces', createWorkspacesRouter());
app.use('/api/templates', createTemplatesRouter(io));

// ── Load templates on startup ────────────────────────────────────────────────
loadAllTemplates();

// ── Auto-load agents on startup ─────────────────────────────────────────────

// 1. Restore runtime state (conversation history, room assignments)
const saved = loadAllAgents();
let restored = 0;
for (const persisted of saved) {
  if (restoreAgent(persisted)) restored++;
}

// 2. Scan workspaces/ for agent.json files not yet in runtime state
const knownPaths = new Set(getAllAgents().map((a) => a.workspacePath));
const discovered = scanAllWorkspaceAgents();
let autoCreated = 0;

for (const { teamId, workspacePath, config } of discovered) {
  if (knownPaths.has(workspacePath)) continue;
  const agent = createAgent({ ...config, teamId, workspacePath });
  if (agent) {
    autoCreated++;
    console.log(`[startup] Auto-loaded agent "${agent.name}" (team: ${teamId}) from ${workspacePath}`);
  }
}

console.log(`[startup] ${restored} restored, ${autoCreated} auto-loaded from workspaces/`);

// ───────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerHandlers(io, socket);
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
