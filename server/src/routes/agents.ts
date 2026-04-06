import { Router } from 'express';
import { z } from 'zod';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
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
      const msg = { role: 'user' as const, content: message };
      agentService.appendMessage(agent.id, msg);
      io.emit('agent:message', { agentId: agent.id, message: msg });
    }
    setImmediate(() => runAgentTask(agent.id, io));
    res.status(202).json({ agentId: agent.id, name: agent.name, teamId: agent.teamId });
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
