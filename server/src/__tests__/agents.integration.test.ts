import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync } from 'fs';
import request from 'supertest';
import type { Application } from 'express';
import type { Server as HttpServer } from 'http';
import type { Server as IOServer } from 'socket.io';

// ── Hoisted helpers (run before any module is loaded) ─────────────────────────
// Use vi.hoisted so the temp workspace path is available inside vi.mock factories.
// Use require() instead of ESM imports because vi.hoisted runs before imports resolve.
const { testWorkspacesDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: mkdir } = require('node:fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: j } = require('node:path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: td } = require('node:os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes: rb } = require('node:crypto') as typeof import('crypto');
  const dir = j(td(), `tonkatsu-integration-${rb(6).toString('hex')}`);
  mkdir(dir, { recursive: true });
  return { testWorkspacesDir: dir };
});

// Mock external services before any imports so no real API keys or git ops are needed.
// vi.mock() is hoisted by Vitest so these always run first.
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
// agentService imports getSessionMessages / listSessions from the SDK;
// those are only used in async helpers (getHistory, getActiveSessions)
// which are never called during the synchronous create/update paths we test.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn().mockResolvedValue(undefined),
  getSessionMessages: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn().mockResolvedValue([]),
}));

// Override WORKSPACES_DIR so agent workspaces are created inside a temp
// directory (not through the `workspaces` symlink which does not exist in CI).
vi.mock('../services/persistenceService.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: j } = require('node:path') as typeof import('path');
  const real = await importOriginal<typeof import('../services/persistenceService.js')>();
  return {
    ...real,
    WORKSPACES_DIR: testWorkspacesDir,
    REPOS_DIR: j(testWorkspacesDir, '.repos'),
    saveAgents: vi.fn(),          // skip disk persistence in tests
    loadAllAgents: vi.fn().mockReturnValue([]),
    getTeamIds: vi.fn().mockReturnValue(['default']),
  };
});

// Dynamic imports after mocks are registered
const { createApp } = await import('../app.js');
const agentModule = await import('../services/agentService.js');

describe('Agent API — integration', () => {
  let app: Application;
  let httpServer: HttpServer;
  let io: IOServer;
  const createdAgentIds: string[] = [];

  beforeAll(() => {
    const instance = createApp();
    app = instance.app;
    httpServer = instance.httpServer;
    io = instance.io;
  });

  afterAll(async () => {
    // Clean up agents and their workspace directories created during tests
    for (const id of createdAgentIds) {
      agentModule.deleteAgent(id);
    }

    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });

    // Remove temp workspace directory
    rmSync(testWorkspacesDir, { recursive: true, force: true });
  });

  // Helper to create an agent and track its ID for cleanup
  async function createTestAgent(overrides: { name?: string; mission?: string; avatarColor?: string } = {}): Promise<{ id: string; body: Record<string, unknown> }> {
    const res = await request(app).post('/api/agents').send({
      name: 'Test Agent',
      mission: 'Integration test agent',
      avatarColor: '#6366f1',
      ...overrides,
    });
    if (res.status === 201) {
      createdAgentIds.push(res.body.id as string);
    }
    return { id: res.body.id as string, body: res.body as Record<string, unknown> };
  }

  // ── GET /api/agents ──────────────────────────────────────────────────────

  describe('GET /api/agents', () => {
    it('returns 200 with an array', async () => {
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── POST /api/agents ─────────────────────────────────────────────────────

  describe('POST /api/agents', () => {
    it('returns 400 for missing required fields', async () => {
      const res = await request(app).post('/api/agents').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid avatarColor', async () => {
      const res = await request(app).post('/api/agents').send({
        name: 'Test Agent',
        mission: 'Test mission',
        avatarColor: 'not-a-color',
      });
      expect(res.status).toBe(400);
    });

    it('creates an agent and returns 201 with correct shape', async () => {
      const res = await request(app).post('/api/agents').send({
        name: 'Integration Agent',
        mission: 'Verify agent creation',
        avatarColor: '#6366f1',
      });
      if (res.status === 201) createdAgentIds.push(res.body.id as string);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Integration Agent',
        mission: 'Verify agent creation',
        avatarColor: '#6366f1',
        status: 'sleeping',
      });
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id).toMatch(/^[\w-]+$/);
    });
  });

  // ── Agent lookup via GET /api/agents ─────────────────────────────────────
  // Note: there is no GET /api/agents/:id route — use the list to verify.

  describe('GET /api/agents — agent appears after creation', () => {
    it('created agent is visible in agent list', async () => {
      const { id } = await createTestAgent({ name: 'Lookup Agent', mission: 'I should be findable' });

      const listRes = await request(app).get('/api/agents');
      expect(listRes.status).toBe(200);
      const found = (listRes.body as Array<{ id: string }>).find((a) => a.id === id);
      expect(found).toBeDefined();
    });
  });

  // ── PUT /api/agents/:id/files/claude-md ──────────────────────────────────

  describe('PUT /api/agents/:id/files/claude-md', () => {
    it('returns 404 for unknown agent id', async () => {
      const res = await request(app)
        .put('/api/agents/nonexistent-id/files/claude-md')
        .send({ content: '# Hello' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when content field is missing', async () => {
      const { id } = await createTestAgent({ name: 'File Agent', mission: 'Test file ops', avatarColor: '#f59e0b' });
      const res = await request(app).put(`/api/agents/${id}/files/claude-md`).send({});
      expect(res.status).toBe(400);
    });

    it('updates CLAUDE.md and returns { ok: true }', async () => {
      const { id } = await createTestAgent({ name: 'Claude Md Agent', mission: 'Test claude.md updates', avatarColor: '#8b5cf6' });
      const res = await request(app)
        .put(`/api/agents/${id}/files/claude-md`)
        .send({ content: '# Updated CLAUDE.md' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  // ── GET /api/agents/:id/files ─────────────────────────────────────────────

  describe('GET /api/agents/:id/files', () => {
    it('returns 404 for unknown agent id', async () => {
      const res = await request(app).get('/api/agents/nonexistent-id/files');
      expect(res.status).toBe(404);
    });

    it('returns workspace files with correct shape', async () => {
      const { id } = await createTestAgent({ name: 'Files Agent', mission: 'Test workspace files endpoint', avatarColor: '#06b6d4' });
      const res = await request(app).get(`/api/agents/${id}/files`);
      expect(res.status).toBe(200);
      // WorkspaceFiles shape from fileService.ts
      expect(res.body).toHaveProperty('claudeMd');
      expect(res.body).toHaveProperty('soul');
      expect(res.body).toHaveProperty('ops');
      expect(res.body).toHaveProperty('tools');
      expect(res.body).toHaveProperty('settings');
      expect(Array.isArray(res.body.commands)).toBe(true);
      expect(Array.isArray(res.body.rules)).toBe(true);
      expect(Array.isArray(res.body.skills)).toBe(true);
    });
  });
});
