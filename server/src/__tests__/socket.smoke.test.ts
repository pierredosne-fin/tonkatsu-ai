import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync } from 'fs';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Application } from 'express';
import type { Server as HttpServer } from 'http';
import type { Server as IOServer } from 'socket.io';

// ── Hoisted helpers (run before any module is loaded) ─────────────────────────
// Use require() inside vi.hoisted because it runs before ESM imports resolve.
const { testWorkspacesDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: mkdir } = require('node:fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: j } = require('node:path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: td } = require('node:os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes: rb } = require('node:crypto') as typeof import('crypto');
  const dir = j(td(), `tonkatsu-socket-${rb(6).toString('hex')}`);
  mkdir(dir, { recursive: true });
  return { testWorkspacesDir: dir };
});

// Mock all external services before any imports
vi.mock('../services/claudeService.js', () => ({
  runAgentTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/cronService.js', () => ({
  initSchedules: vi.fn(),
  reloadSchedules: vi.fn(),
  getAllSchedules: vi.fn().mockReturnValue([]),
  getSchedulesForAgent: vi.fn().mockReturnValue([]),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn().mockReturnValue(true),
  deleteSchedulesForAgent: vi.fn(),
}));

vi.mock('../services/gitService.js', () => ({
  syncAgentRepo: vi.fn(),
  syncWorktreeFromBase: vi.fn(),
  createWorktree: vi.fn().mockReturnValue(true),
  removeWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
  cloneRepoIfNeeded: vi.fn().mockReturnValue(null),
  isGitRepo: vi.fn().mockReturnValue(false),
  syncWorkspaceDir: vi.fn().mockReturnValue({ ok: true }),
  repoSlugFromUrl: vi.fn().mockReturnValue('test-repo'),
  syncFromRemote: vi.fn().mockReturnValue({ ok: true }),
}));

// Mock the Claude agent SDK to avoid requiring ANTHROPIC_API_KEY in CI.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn().mockResolvedValue(undefined),
  getSessionMessages: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn().mockResolvedValue([]),
}));

// Override WORKSPACES_DIR to a temp directory (the committed `workspaces`
// symlink points to a local absolute path that does not exist in CI).
vi.mock('../services/persistenceService.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: j } = require('node:path') as typeof import('path');
  const real = await importOriginal<typeof import('../services/persistenceService.js')>();
  return {
    ...real,
    WORKSPACES_DIR: testWorkspacesDir,
    REPOS_DIR: j(testWorkspacesDir, '.repos'),
    saveAgents: vi.fn(),
    loadAllAgents: vi.fn().mockReturnValue([]),
    getTeamIds: vi.fn().mockReturnValue(['default']),
  };
});

// Dynamic imports after mocks are registered
const { createApp } = await import('../app.js');
const { registerHandlers } = await import('../socket/handlers.js');
const agentModule = await import('../services/agentService.js');

describe('Socket.IO smoke test', () => {
  let app: Application;
  let httpServer: HttpServer;
  let io: IOServer;
  let port: number;
  let clientSocket: ClientSocket;
  const createdAgentIds: string[] = [];

  beforeAll(async () => {
    const instance = createApp();
    app = instance.app;
    httpServer = instance.httpServer;
    io = instance.io;

    // Register socket handlers (done in index.ts in production, explicitly here for tests)
    io.on('connection', (socket) => {
      registerHandlers(io, socket);
    });

    // Listen on a random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const addr = httpServer.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    // Connect a test socket client
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    // Wait for the client to connect and receive the initial agent:list event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      clientSocket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      clientSocket.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  afterAll(async () => {
    // Clean up agents created during tests
    for (const id of createdAgentIds) {
      agentModule.deleteAgent(id);
    }

    clientSocket.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });

    // Remove temp workspace directory
    rmSync(testWorkspacesDir, { recursive: true, force: true });
  });

  it('receives agent:list on connect', async () => {
    // Connect a fresh client and wait for agent:list
    const freshClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });
    try {
      const agentList = await new Promise<unknown[]>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for agent:list')), 3000);
        freshClient.once('agent:list', (list: unknown[]) => {
          clearTimeout(timeout);
          resolve(list);
        });
        freshClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      expect(Array.isArray(agentList)).toBe(true);
    } finally {
      freshClient.disconnect();
    }
  });

  it('receives team:list on connect', async () => {
    const freshClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });
    try {
      const teamList = await new Promise<unknown[]>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for team:list')), 3000);
        freshClient.once('team:list', (list: unknown[]) => {
          clearTimeout(timeout);
          resolve(list);
        });
        freshClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      expect(Array.isArray(teamList)).toBe(true);
    } finally {
      freshClient.disconnect();
    }
  });

  it('receives agent:created event when an agent is created via REST API', async () => {
    const agentCreatedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for agent:created')), 5000);
      clientSocket.once('agent:created', (agent: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(agent);
      });
    });

    // Create an agent via REST to trigger the socket event
    const res = await request(app).post('/api/agents').send({
      name: 'Socket Test Agent',
      mission: 'Verify socket events are emitted',
      avatarColor: '#ef4444',
    });
    expect(res.status).toBe(201);
    createdAgentIds.push(res.body.id as string);

    const created = await agentCreatedPromise;
    expect(created.name).toBe('Socket Test Agent');
    expect(created.mission).toBe('Verify socket events are emitted');
    expect(typeof created.id).toBe('string');
  });

  it('receives agent:updated event when an agent is patched via REST API', async () => {
    // Create an agent first
    const createRes = await request(app).post('/api/agents').send({
      name: 'Update Target',
      mission: 'This will be updated',
      avatarColor: '#6366f1',
    });
    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id as string;
    createdAgentIds.push(agentId);

    const agentUpdatedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for agent:updated')), 5000);
      clientSocket.once('agent:updated', (agent: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(agent);
      });
    });

    // Patch the agent to trigger agent:updated
    const patchRes = await request(app)
      .patch(`/api/agents/${agentId}`)
      .send({ mission: 'Updated mission via test' });
    expect(patchRes.status).toBe(200);

    const updated = await agentUpdatedPromise;
    expect(updated.id).toBe(agentId);
    expect(updated.mission).toBe('Updated mission via test');
  });
});
