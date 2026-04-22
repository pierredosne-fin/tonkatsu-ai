import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import * as templateService from '../services/templateService.js';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import * as fileService from '../services/fileService.js';
import type { Server } from 'socket.io';

const AgentTemplateSchema = z.object({
  name: z.string().min(1).max(50),
  mission: z.string().min(1).max(1000),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  repoUrl: z.string().optional(),
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

  router.patch('/agents/:id', (req, res) => {
    const result = AgentTemplateSchema.partial().safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const updated = templateService.updateAgentTemplate(req.params.id, result.data);
    if (!updated) {
      res.status(404).json({ error: 'Agent template not found' });
      return;
    }
    res.json(updated);
  });

  // ── Agent Template Workspace Files ──────────────────────────────────────────

  router.get('/agents/:id/files', (req, res) => {
    const t = templateService.getAgentTemplate(req.params.id);
    if (!t) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fileService.readWorkspaceFiles(templateService.getAgentTemplateWorkspacePath(req.params.id)));
  });

  router.put('/agents/:id/files/claude-md', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeClaudeMd(templateService.getAgentTemplateWorkspacePath(req.params.id), content);
    res.json({ ok: true });
  });

  router.put('/agents/:id/files/settings', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try { fileService.writeSettings(templateService.getAgentTemplateWorkspacePath(req.params.id), content); res.json({ ok: true }); }
    catch { res.status(400).json({ error: 'Invalid JSON' }); }
  });

  router.put('/agents/:id/files/soul-md', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeSoul(templateService.getAgentTemplateWorkspacePath(req.params.id), content);
    res.json({ ok: true });
  });

  router.put('/agents/:id/files/ops-md', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeOps(templateService.getAgentTemplateWorkspacePath(req.params.id), content);
    res.json({ ok: true });
  });

  router.put('/agents/:id/files/tools-md', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeTools(templateService.getAgentTemplateWorkspacePath(req.params.id), content);
    res.json({ ok: true });
  });

  router.put('/agents/:id/files/commands/:name(*)', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try { fileService.writeCommand(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name, content); res.json({ ok: true }); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  router.delete('/agents/:id/files/commands/:name(*)', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    try { fileService.deleteCommand(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name); res.status(204).send(); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  router.put('/agents/:id/files/rules/:name(*)', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try { fileService.writeRule(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name, content); res.json({ ok: true }); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  router.delete('/agents/:id/files/rules/:name(*)', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    try { fileService.deleteRule(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name); res.status(204).send(); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  router.put('/agents/:id/files/skills/:name', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    try { fileService.writeSkill(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name, content); res.json({ ok: true }); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  router.delete('/agents/:id/files/skills/:name', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    try { fileService.deleteSkill(templateService.getAgentTemplateWorkspacePath(req.params.id), req.params.name); res.status(204).send(); }
    catch (e: unknown) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
  });

  // ── Generate / improve CLAUDE.md for a template ─────────────────────────────

  router.post('/agents/:id/generate-claude-md', async (req, res) => {
    const t = templateService.getAgentTemplate(req.params.id);
    if (!t) { res.status(404).json({ error: 'Not found' }); return; }
    const { current } = req.body;
    try {
      const client = new Anthropic();
      const isImproving = typeof current === 'string' && current.trim().length > 0;
      const message = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        system: `You are an expert at writing CLAUDE.md files — the custom system prompt for an AI agent running inside Claude Code.

A CLAUDE.md is loaded into the agent's context and acts as its primary instructions. It should:
- Be concise and actionable (the agent is smart, don't over-explain)
- Define the agent's persona, working style, and specific domain expertise
- Specify output formats, tools to prefer, and key constraints
- Reference workspace files the agent should consult (SOUL.md, OPS.md, MEMORY.md, etc.)
- Avoid generic LLM boilerplate — be specific to this agent's role

Return ONLY the CLAUDE.md content, no preamble, no markdown code fences.`,
        messages: [
          {
            role: 'user',
            content: isImproving
              ? `Improve this CLAUDE.md for an agent template named "${t.name}" with mission: "${t.mission}".

Current CLAUDE.md:
${current}

Make it more effective: sharpen the instructions, remove vague filler, add missing domain-specific guidance. Keep what's good.`
              : `Generate a CLAUDE.md for an agent template named "${t.name}".

Mission: ${t.mission}

Write tailored, concise instructions that will make this agent highly effective at its mission.`,
          },
        ],
      });
      const block = message.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response');
      res.json({ content: block.text });
    } catch (err) {
      console.error('[templates] generate-claude-md error:', err);
      res.status(500).json({ error: 'Generation failed' });
    }
  });

  router.post('/agents/:id/generate-workspace-file', async (req, res) => {
    const t = templateService.getAgentTemplate(req.params.id);
    if (!t) { res.status(404).json({ error: 'Not found' }); return; }
    const { file, current } = req.body;
    if (!['soul', 'ops', 'tools'].includes(file)) { res.status(400).json({ error: 'file must be soul | ops | tools' }); return; }
    const prompts: Record<string, { system: string; generate: string; improve: string }> = {
      soul: {
        system: `You are an expert at writing SOUL.md files for AI agents. SOUL.md defines the agent's identity, core principles, and values. It answers "who is this agent?" — not what it does, but how it thinks, what it stands for, and its working philosophy. Be concise, specific, and inspiring. Return ONLY the SOUL.md content, no preamble, no markdown code fences.`,
        generate: `Write a SOUL.md for an agent template named "${t.name}".\n\nMission: ${t.mission}\n\nDefine its identity, core principles, and values in a way that will guide all its decisions.`,
        improve: `Improve this SOUL.md for an agent template named "${t.name}" with mission: "${t.mission}".\n\nCurrent SOUL.md:\n${current}\n\nMake it more specific, principled, and actionable. Keep what's good.`,
      },
      ops: {
        system: `You are an expert at writing OPS.md files for AI agents. OPS.md is the operational playbook — recurring tasks, conventions, constraints, and workflows the agent must follow. It answers "how does this agent operate day-to-day?". Be concrete and specific. Return ONLY the OPS.md content, no preamble, no markdown code fences.`,
        generate: `Write an OPS.md for an agent template named "${t.name}".\n\nMission: ${t.mission}\n\nDefine its recurring tasks, key conventions, constraints, and operational workflows.`,
        improve: `Improve this OPS.md for an agent template named "${t.name}" with mission: "${t.mission}".\n\nCurrent OPS.md:\n${current}\n\nMake it more actionable and complete. Keep what's good.`,
      },
      tools: {
        system: `You are an expert at writing TOOLS.md files for AI agents. TOOLS.md documents the tools, APIs, endpoints, and environment context available to the agent. It answers "what can this agent use and where?". Be precise and useful. Return ONLY the TOOLS.md content, no preamble, no markdown code fences.`,
        generate: `Write a TOOLS.md for an agent template named "${t.name}".\n\nMission: ${t.mission}\n\nDocument the tools, APIs, and environment context this agent would typically have access to for its role.`,
        improve: `Improve this TOOLS.md for an agent template named "${t.name}" with mission: "${t.mission}".\n\nCurrent TOOLS.md:\n${current}\n\nMake it more complete and precise. Keep what's good.`,
      },
    };
    const p = prompts[file as string];
    const isImproving = typeof current === 'string' && current.trim().length > 0;
    try {
      const client = new Anthropic();
      const message = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        system: p.system,
        messages: [{ role: 'user', content: isImproving ? p.improve : p.generate }],
      });
      const block = message.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response');
      res.json({ content: block.text });
    } catch (err) {
      console.error('[templates] generate-workspace-file error:', err);
      res.status(500).json({ error: 'Generation failed' });
    }
  });

  // ── Snapshot agent as template ──────────────────────────────────────────────

  router.post('/agents/from-agent/:agentId', (req, res) => {
    const agent = agentService.getAgent(req.params.agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const template = templateService.createAgentTemplate({
      name: agent.name,
      mission: agent.mission,
      avatarColor: agent.avatarColor,
    });
    if (agent.repoUrl) {
      fileService.snapshotWorkspace(
        agent.repoUrl,
        templateService.getAgentTemplateWorkspacePath(template.id),
      );
    }
    res.status(201).json(template);
  });

  router.get('/agents/:id/override-settings', (req, res) => {
    const settings = templateService.getAgentTemplateOverrideSettings(req.params.id);
    if (settings === null) { res.status(404).json({ error: 'Agent template not found' }); return; }
    res.json(settings);
  });

  router.put('/agents/:id/override-settings', (req, res) => {
    if (!templateService.getAgentTemplate(req.params.id)) { res.status(404).json({ error: 'Agent template not found' }); return; }
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({ error: 'Body must be a JSON object' });
      return;
    }
    const updated = templateService.setAgentTemplateOverrideSettings(req.params.id, req.body);
    res.json(updated);
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

  router.patch('/teams/:id', (req, res) => {
    const result = TeamTemplateSchema.partial().safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: result.error.flatten() }); return; }
    const updated = templateService.updateTeamTemplate(req.params.id, result.data);
    if (!updated) { res.status(404).json({ error: 'Team template not found' }); return; }
    res.json(updated);
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
        repoUrl: agentTemplate.repoUrl,
      });
      if (agent) {
        // Copy template workspace files to the agent's workspace
        fileService.copyWorkspaceFiles(
          templateService.getAgentTemplateWorkspacePath(agentTemplate.id),
          agent.workspacePath,
        );
        // Apply override settings on top of the copied workspace settings
        if (agentTemplate.overrideSettings && Object.keys(agentTemplate.overrideSettings).length > 0) {
          const existing = fileService.readWorkspaceFiles(agent.workspacePath).settings;
          const base = existing ? JSON.parse(existing) : {};
          const merged = { ...base, ...agentTemplate.overrideSettings };
          fileService.writeSettings(agent.workspacePath, JSON.stringify(merged, null, 2));
        }
        io.emit('agent:created', agentService.toClientAgent(agent));
        createdAgents.push(agentService.toClientAgent(agent));
      }
    }

    io.emit('team:list', agentService.getTeamList());
    res.status(201).json({ teamId, agents: createdAgents });
  });

  return router;
}
