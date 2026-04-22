import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PORT } from './config.js';
import { createApp } from './app.js';
import { registerHandlers } from './socket/handlers.js';
import { loadAllAgents, setupSshIdentity } from './services/persistenceService.js';
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

const { app, httpServer, io } = createApp();

// ── Serve React client static files (production) ─────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

// ── Load data before accepting connections ───────────────────────────────────

try { setupSshIdentity(); } catch (err) { console.error('[startup] setupSshIdentity failed:', err); }
try { loadAllTemplates(); } catch (err) { console.error('[startup] loadAllTemplates failed:', err); }
try { syncTemplateFolders(); } catch (err) { console.error('[startup] syncTemplateFolders failed:', err); }
try { loadAllSkills(); } catch (err) { console.error('[startup] loadAllSkills failed:', err); }

try {
  const persisted = loadAllAgents();
  let restored = 0;
  for (const p of persisted) {
    if (restoreAgent(p)) restored++;
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
  setTimeout(() => process.exit(0), 2000).unref();
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
