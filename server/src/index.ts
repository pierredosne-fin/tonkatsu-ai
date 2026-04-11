import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT } from './config.js';
import { createAgentRouter, createRoomsRouter, createTeamsRouter } from './routes/agents.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createSchedulesRouter } from './routes/schedules.js';
import { createSkillsRouter } from './routes/skills.js';
import { registerHandlers } from './socket/handlers.js';
import { loadAllAgents } from './services/persistenceService.js';
import { restoreAgent } from './services/agentService.js';
import { loadAllTemplates, syncTemplateFolders } from './services/templateService.js';
import { loadAllSkills } from './services/skillService.js';
import { initSchedules } from './services/cronService.js';

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
});

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
app.use('/api/schedules', createSchedulesRouter(io));
app.use('/api/skills', createSkillsRouter());

// ── Load data before accepting connections ───────────────────────────────────

try { loadAllTemplates(); } catch (err) { console.error('[startup] loadAllTemplates failed:', err); }
try { syncTemplateFolders(); } catch (err) { console.error('[startup] syncTemplateFolders failed:', err); }
try { loadAllSkills(); } catch (err) { console.error('[startup] loadAllSkills failed:', err); }

try {
  const saved = loadAllAgents();
  let restored = 0;
  for (const persisted of saved) {
    if (restoreAgent(persisted)) restored++;
  }
  console.log(`[startup] ${restored} agents restored`);
} catch (err) {
  console.error('[startup] loadAllAgents/restoreAgent failed:', err);
}

try { initSchedules(io); } catch (err) { console.error('[startup] initSchedules failed:', err); }

// ── Socket handlers ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerHandlers(io, socket);
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} reason=${reason}`);
  });
});

// ── Start listening ───────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[process] SIGTERM received — tsx is restarting due to a file change in src/');
  process.exit(0);
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
