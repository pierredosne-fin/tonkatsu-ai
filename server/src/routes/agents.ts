import { Router } from 'express';
import { z } from 'zod';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import * as fileService from '../services/fileService.js';
import { runAgentTask } from '../services/claudeService.js';
import type { Server } from 'socket.io';

export function createAgentRouter(io: Server) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(agentService.getAllAgents().map(agentService.toClientAgent));
  });

  const CreateSchema = z.object({
    name: z.string().min(1).max(50),
    mission: z.string().min(1).max(1000),
    avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    teamId: z.string().optional(),
    workspacePath: z.string().optional(),
  });

  router.post('/', (req, res) => {
    const result = CreateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }

    const teamId = result.data.teamId || 'default';

    if (!roomService.hasVacantRoom(teamId)) {
      res.status(409).json({ error: 'No vacant rooms available in this team' });
      return;
    }

    const agent = agentService.createAgent({ ...result.data, teamId });
    if (!agent) {
      res.status(409).json({ error: 'No vacant rooms available' });
      return;
    }

    io.emit('agent:created', agentService.toClientAgent(agent));
    io.emit('team:list', agentService.getTeamList());
    res.status(201).json(agentService.toClientAgent(agent));

    setImmediate(() => {
      runAgentTask(agent.id, io);
    });
  });

  router.post('/:id/trigger', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (agent.status === 'working' || agent.status === 'delegating') {
      res.status(409).json({ error: 'Agent is already working' });
      return;
    }
    const { message } = req.body ?? {};
    if (message) {
      io.emit('agent:message', { agentId: agent.id, message: { role: 'user', content: message } });
    }
    setImmediate(() => runAgentTask(agent.id, io, message ?? undefined));
    res.status(202).json({ agentId: agent.id, name: agent.name, teamId: agent.teamId });
  });

  const UpdateSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    mission: z.string().min(1).max(1000).optional(),
    avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    canCreateAgents: z.boolean().optional(),
  });

  router.patch('/:id', (req, res) => {
    const result = UpdateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const updated = agentService.updateAgent(req.params.id, result.data);
    if (!updated) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    io.emit('agent:updated', agentService.toClientAgent(updated));
    res.json(agentService.toClientAgent(updated));
  });

  // ── Workspace Files ───────────────────────────────────────────────────────

  router.get('/:id/files', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(fileService.readWorkspaceFiles(agent.workspacePath));
  });

  router.put('/:id/files/claude-md', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeClaudeMd(agent.workspacePath, content);
    res.json({ ok: true });
  });

  router.put('/:id/files/settings', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try {
      fileService.writeSettings(agent.workspacePath, content);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
    }
  });

  router.put('/:id/files/commands/:name(*)', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try {
      fileService.writeCommand(agent.workspacePath, req.params.name, content);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.delete('/:id/files/commands/:name(*)', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    try {
      fileService.deleteCommand(agent.workspacePath, req.params.name);
      res.status(204).send();
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.put('/:id/files/rules/:name(*)', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try {
      fileService.writeRule(agent.workspacePath, req.params.name, content);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.delete('/:id/files/rules/:name(*)', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    try {
      fileService.deleteRule(agent.workspacePath, req.params.name);
      res.status(204).send();
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.put('/:id/files/skills/:name', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try {
      fileService.writeSkill(agent.workspacePath, req.params.name, content);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.delete('/:id/files/skills/:name', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    try {
      fileService.deleteSkill(agent.workspacePath, req.params.name);
      res.status(204).send();
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
    }
  });

  router.delete('/:id', (req, res) => {
    const deleted = agentService.deleteAgent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    io.emit('agent:deleted', { agentId: req.params.id });
    io.emit('team:list', agentService.getTeamList());
    res.status(204).send();
  });

  return router;
}

export function createTeamsRouter(io: Server) {
  const router = Router();

  router.delete('/:teamId', (req, res) => {
    const { teamId } = req.params;
    const deletedIds = agentService.deleteTeam(teamId);
    for (const agentId of deletedIds) {
      io.emit('agent:deleted', { agentId });
    }
    io.emit('team:list', agentService.getTeamList());
    res.status(204).send();
  });

  return router;
}

export function createRoomsRouter() {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(roomService.getAllRooms());
  });
  return router;
}
