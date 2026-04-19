import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PORT, READ_ONLY } from './config.js';
import { createAgentRouter, createRoomsRouter, createTeamsRouter } from './routes/agents.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createSchedulesRouter } from './routes/schedules.js';
import { createSkillsRouter } from './routes/skills.js';
import { createSshKeysRouter } from './routes/sshKeys.js';
import { createWorkspaceSyncRouter } from './routes/workspaceSync.js';
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

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const isProd = process.env.NODE_ENV === 'production';

// In production, client and server share the same origin — no CORS needed.
// In dev, allow Vite's port.
const io = new Server(httpServer, {
  cors: isProd ? { origin: '*' } : { origin: DEV_ORIGINS, methods: ['GET', 'POST'] },
});

app.use(cors(isProd ? {} : { origin: DEV_ORIGINS }));
app.use(express.json());

app.get('/api/config', (_req, res) => {
  res.json({ readOnly: READ_ONLY });
});

if (READ_ONLY) {
  console.log('[startup] READ_ONLY mode enabled — write operations are disabled');
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'OPTIONS') return next();
    // Allow sending messages to agents via REST trigger
    if (req.method === 'POST' && /^\/api\/agents\/[^/]+\/trigger$/.test(req.path)) return next();
    res.status(403).json({ error: 'Read-only mode: modifications are disabled' });
  });
}

app.use('/api/agents', createAgentRouter(io));
app.use('/api/rooms', createRoomsRouter());
app.use('/api/teams', createTeamsRouter(io));
app.use('/api/workspaces', createWorkspacesRouter());
app.use('/api/templates', createTemplatesRouter(io));
app.use('/api/schedules', createSchedulesRouter(io));
app.use('/api/skills', createSkillsRouter());
app.use('/api/ssh-keys', createSshKeysRouter());
app.use('/api/workspace-sync', createWorkspaceSyncRouter(io));

// ── Serve React client static files (production) ─────────────────────────────
// In dev, Vite serves the client separately. In production, Express serves
// the built client/dist so that relative /api calls resolve correctly.
if (isProd) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

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
  console.log('[process] SIGTERM received — closing connections before exit');
  io.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
  // Force exit after 2s if handles won't close
  setTimeout(() => process.exit(0), 2000).unref();
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
