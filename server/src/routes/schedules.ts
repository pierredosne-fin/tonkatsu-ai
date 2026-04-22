import { Router } from 'express';
import { z } from 'zod';
import type { Server } from 'socket.io';
import * as agentService from '../services/agentService.js';
import * as cronService from '../services/cronService.js';

export function createSchedulesRouter(io: Server) {
  const router = Router();

  router.get('/', (req, res) => {
    const { agentId } = req.query;
    if (typeof agentId === 'string') {
      res.json(cronService.getSchedulesForAgent(agentId));
    } else {
      res.json(cronService.getAllSchedules());
    }
  });

  const CreateSchema = z.object({
    agentId: z.string().min(1),
    cronExpression: z.string().min(1),
    message: z.string().min(1),
    enabled: z.boolean().optional(),
    ttlMs: z.number().int().positive().optional(),
  });

  router.post('/', (req, res) => {
    const result = CreateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const agent = agentService.getAgent(result.data.agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const schedule = cronService.createSchedule(result.data, io);
    if ('error' in schedule) {
      res.status(400).json(schedule);
      return;
    }
    res.status(201).json(schedule);
  });

  const UpdateSchema = z.object({
    cronExpression: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  });

  router.patch('/:id', (req, res) => {
    const result = UpdateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const updated = cronService.updateSchedule(req.params.id, result.data, io);
    if (!updated) {
      res.status(404).json({ error: 'Schedule not found or invalid cron expression' });
      return;
    }
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const deleted = cronService.deleteSchedule(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
