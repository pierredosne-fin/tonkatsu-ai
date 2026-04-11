import { Router } from 'express';
import { z } from 'zod';
import * as skillService from '../services/skillService.js';

const SkillSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[\w-]+$/, 'Name must be alphanumeric with hyphens'),
  description: z.string().min(1).max(500),
  content: z.string(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
});

const GenerateSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
});

const AddToAgentSchema = z.object({
  agentId: z.string().uuid(),
});

export function createSkillsRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(skillService.getAllSkills());
  });

  // Generate SKILL.md content using Claude — must be before /:id routes
  router.post('/generate', async (req, res) => {
    const result = GenerateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    try {
      const content = await skillService.generateSkillContent(result.data.name, result.data.description);
      res.json({ content });
    } catch (err) {
      console.error('[skills] generate error:', err);
      res.status(500).json({ error: 'Failed to generate skill content' });
    }
  });

  router.post('/', (req, res) => {
    const result = SkillSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const skill = skillService.createSkill(result.data);
    res.status(201).json(skill);
  });

  router.patch('/:id', (req, res) => {
    const result = SkillSchema.partial().safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const updated = skillService.updateSkill(req.params.id, result.data);
    if (!updated) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const deleted = skillService.deleteSkill(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.status(204).send();
  });

  // Add skill from library to a specific agent workspace
  router.post('/:id/add-to-agent', (req, res) => {
    const result = AddToAgentSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const ok = skillService.addSkillToAgent(req.params.id, result.data.agentId);
    if (!ok) {
      res.status(404).json({ error: 'Skill or agent not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
