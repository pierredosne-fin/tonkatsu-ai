import { Router } from 'express';
import { z } from 'zod';
import * as templateService from '../services/templateService.js';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import type { Server } from 'socket.io';

const AgentTemplateSchema = z.object({
  name: z.string().min(1).max(50),
  mission: z.string().min(1).max(1000),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const TeamTemplateSchema = z.object({
  name: z.string().min(1).max(50),
  agentTemplateIds: z.array(z.string().uuid()).min(1).max(9),
});

const InstantiateSchema = z.object({
  teamId: z.string().optional(),
});

export function createTemplatesRouter(io: Server) {
  const router = Router();

  // ── Agent Templates ─────────────────────────────────────────────────────────

  router.get('/agents', (_req, res) => {
    res.json(templateService.getAllAgentTemplates());
  });

  router.post('/agents', (req, res) => {
    const result = AgentTemplateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const template = templateService.createAgentTemplate(result.data);
    res.status(201).json(template);
  });

  router.delete('/agents/:id', (req, res) => {
    const deleted = templateService.deleteAgentTemplate(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent template not found' });
      return;
    }
    res.status(204).send();
  });

  // ── Team Templates ──────────────────────────────────────────────────────────

  router.get('/teams', (_req, res) => {
    res.json(templateService.getAllTeamTemplates());
  });

  router.post('/teams', (req, res) => {
    const result = TeamTemplateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const template = templateService.createTeamTemplate(result.data);
    if ('error' in template) {
      res.status(400).json({ error: template.error });
      return;
    }
    res.status(201).json(template);
  });

  router.delete('/teams/:id', (req, res) => {
    const deleted = templateService.deleteTeamTemplate(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Team template not found' });
      return;
    }
    res.status(204).send();
  });

  // ── Instantiate Team from Template ──────────────────────────────────────────

  router.post('/teams/:id/instantiate', (req, res) => {
    const teamTemplate = templateService.getTeamTemplate(req.params.id);
    if (!teamTemplate) {
      res.status(404).json({ error: 'Team template not found' });
      return;
    }

    const parsed = InstantiateSchema.safeParse(req.body);
    const teamId = parsed.success && parsed.data.teamId
      ? parsed.data.teamId.trim().toLowerCase().replace(/\s+/g, '-')
      : teamTemplate.name.toLowerCase().replace(/\s+/g, '-');

    const agentTemplates = teamTemplate.agentTemplateIds
      .map((id) => templateService.getAgentTemplate(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

    if (agentTemplates.length === 0) {
      res.status(400).json({ error: 'No valid agent templates in this team template' });
      return;
    }

    if (!roomService.hasVacantRoom(teamId) && agentTemplates.length > 0) {
      // Allow if rooms are available; createAgent checks internally
    }

    const createdAgents = [];
    for (const agentTemplate of agentTemplates) {
      const agent = agentService.createAgent({
        name: agentTemplate.name,
        mission: agentTemplate.mission,
        avatarColor: agentTemplate.avatarColor,
        teamId,
        templateSlug: agentTemplate.name.toLowerCase().replace(/\s+/g, '-'),
      });
      if (agent) {
        io.emit('agent:created', agentService.toClientAgent(agent));
        createdAgents.push(agentService.toClientAgent(agent));
      }
    }

    io.emit('team:list', agentService.getTeamList());
    res.status(201).json({ teamId, agents: createdAgents });
  });

  return router;
}
