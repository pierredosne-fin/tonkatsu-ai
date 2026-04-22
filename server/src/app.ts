import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createAgentRouter, createRoomsRouter, createTeamsRouter } from './routes/agents.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createSchedulesRouter } from './routes/schedules.js';
import { createSkillsRouter } from './routes/skills.js';
import { createSshKeysRouter } from './routes/sshKeys.js';
import { createWorkspaceSyncRouter } from './routes/workspaceSync.js';
import { createFanOutRouter } from './routes/fanOut.js';
import { READ_ONLY } from './config.js';

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export interface AppInstance {
  app: express.Application;
  httpServer: import('http').Server;
  io: Server;
}

export function createApp(): AppInstance {
  const app = express();
  const httpServer = createServer(app);

  const isProd = process.env.NODE_ENV === 'production';

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
  app.use('/api/fan-out', createFanOutRouter(io));

  return { app, httpServer, io };
}
