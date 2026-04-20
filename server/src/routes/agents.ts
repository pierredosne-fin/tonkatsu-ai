import { Router } from 'express';
import { z } from 'zod';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import * as fileService from '../services/fileService.js';
import * as templateService from '../services/templateService.js';
import { runAgentTask } from '../services/claudeService.js';
import { deleteSchedulesForAgent } from '../services/cronService.js';
import { syncAgentRepo, syncWorktreeFromBase } from '../services/gitService.js';
import Anthropic from '@anthropic-ai/sdk';
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
    repoUrl: z.string().min(1).optional(),
    repoBranch: z.string().optional(),
    agentTemplateId: z.string().uuid().optional(),
    canCreateAgents: z.boolean().optional(),
  });

  router.post('/', (req, res, next) => {
    try {
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

      // Inherit template repoUrl if user didn't override
      let effectiveRepoUrl = result.data.repoUrl;
      if (!effectiveRepoUrl && result.data.agentTemplateId) {
        const tmpl = templateService.getAgentTemplate(result.data.agentTemplateId);
        if (tmpl?.repoUrl) effectiveRepoUrl = tmpl.repoUrl;
      }

      const agent = agentService.createAgent({ ...result.data, teamId, repoUrl: effectiveRepoUrl });
      if (!agent) {
        res.status(409).json({ error: effectiveRepoUrl ? 'Failed to set up agent workspace (git clone or worktree error)' : 'No vacant rooms available' });
        return;
      }

      if (result.data.agentTemplateId) {
        fileService.copyWorkspaceFiles(
          templateService.getAgentTemplateWorkspacePath(result.data.agentTemplateId),
          agent.workspacePath,
        );
        // copyWorkspaceFiles replaces .claude/ entirely — re-apply permissions that
        // createAgent wrote to settings.json before the template copy.
        fileService.setCreateAgentsPermission(agent.workspacePath, agent.canCreateAgents ?? false);
      }

      io.emit('agent:created', agentService.toClientAgent(agent));
      io.emit('team:list', agentService.getTeamList());
      res.status(201).json(agentService.toClientAgent(agent));
    } catch (err) {
      console.error('[POST /api/agents] Unexpected error:', err);
      next(err);
    }
  });

  router.post('/generate-mission', async (req, res) => {
    const { name, current } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const client = new Anthropic();
      const isImproving = typeof current === 'string' && current.trim().length > 0;
      const message = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        system: `You write concise, specific mission statements for AI agents. A mission is 1-3 sentences max. It should be precise, actionable, and scoped — not vague. Write in the imperative form. Return ONLY the mission text, nothing else.`,
        messages: [{
          role: 'user',
          content: isImproving
            ? `Improve this mission for an agent named "${name.trim()}":\n\n${current}\n\nMake it sharper, more specific, and more actionable.`
            : `Write a mission for an AI agent named "${name.trim()}".`,
        }],
      });
      const block = message.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response');
      res.json({ mission: block.text.trim() });
    } catch (err) {
      console.error('[agents] generate-mission error:', err);
      res.status(500).json({ error: 'Generation failed' });
    }
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
    runAgentTask(agent.id, io, message ?? undefined).catch((err) =>
      console.error(`[trigger] runAgentTask error for ${agent.id}:`, err)
    );
    res.status(202).json({ agentId: agent.id, name: agent.name, teamId: agent.teamId });
  });

  const GitSyncSchema = z.object({
    remoteUrl: z.string().min(1),
    branch: z.string().min(1),
    authMethod: z.enum(['ssh', 'system']),
    sshKeyName: z.string().optional(),
    lastSyncAt: z.string().optional(),
    lastSyncStatus: z.enum(['ok', 'error']).optional(),
    lastSyncError: z.string().optional(),
  });

  const UpdateSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    mission: z.string().min(1).max(1000).optional(),
    avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    canCreateAgents: z.boolean().optional(),
    gitSync: GitSyncSchema.nullable().optional(),
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

  router.put('/:id/files/soul-md', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeSoul(agent.workspacePath, content);
    res.json({ ok: true });
  });

  router.put('/:id/files/ops-md', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeOps(agent.workspacePath, content);
    res.json({ ok: true });
  });

  router.put('/:id/files/tools-md', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { content } = req.body;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    fileService.writeTools(agent.workspacePath, content);
    res.json({ ok: true });
  });

  // ── Permissions ────────────────────────────────────────────────────────────

  router.get('/:id/permissions', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json({ allow: fileService.readPermissions(agent.workspacePath) });
  });

  router.put('/:id/permissions', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { allow } = req.body;
    if (!Array.isArray(allow) || !allow.every((p) => typeof p === 'string')) {
      res.status(400).json({ error: 'allow must be an array of strings' });
      return;
    }
    fileService.writePermissions(agent.workspacePath, allow);
    res.json({ allow });
  });

  router.post('/:id/permissions', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { permission } = req.body;
    if (typeof permission !== 'string' || !permission.trim()) {
      res.status(400).json({ error: 'permission (string) required' });
      return;
    }
    const allow = fileService.addPermission(agent.workspacePath, permission.trim());
    res.json({ allow });
  });

  router.delete('/:id/permissions', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { permission } = req.body;
    if (typeof permission !== 'string' || !permission.trim()) {
      res.status(400).json({ error: 'permission (string) required' });
      return;
    }
    const allow = fileService.removePermission(agent.workspacePath, permission.trim());
    res.json({ allow });
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

  router.post('/:id/generate-claude-md', async (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
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
              ? `Improve this CLAUDE.md for an agent named "${agent.name}" with mission: "${agent.mission}".

Current CLAUDE.md:
${current}

Make it more effective: sharpen the instructions, remove vague filler, add missing domain-specific guidance. Keep what's good.`
              : `Generate a CLAUDE.md for an agent named "${agent.name}".

Mission: ${agent.mission}

Write tailored, concise instructions that will make this agent highly effective at its mission.`,
          },
        ],
      });
      const block = message.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response');
      res.json({ content: block.text });
    } catch (err) {
      console.error('[agents] generate-claude-md error:', err);
      res.status(500).json({ error: 'Generation failed' });
    }
  });

  router.post('/:id/generate-workspace-file', async (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const { file, current } = req.body;
    if (!['soul', 'ops', 'tools'].includes(file)) { res.status(400).json({ error: 'file must be soul | ops | tools' }); return; }
    const prompts: Record<string, { system: string; generate: string; improve: string }> = {
      soul: {
        system: `You are an expert at writing SOUL.md files for AI agents. SOUL.md defines the agent's identity, core principles, and values. It answers "who is this agent?" — not what it does, but how it thinks, what it stands for, and its working philosophy. Be concise, specific, and inspiring. Return ONLY the SOUL.md content, no preamble, no markdown code fences.`,
        generate: `Write a SOUL.md for an agent named "${agent.name}".\n\nMission: ${agent.mission}\n\nDefine its identity, core principles, and values in a way that will guide all its decisions.`,
        improve: `Improve this SOUL.md for an agent named "${agent.name}" with mission: "${agent.mission}".\n\nCurrent SOUL.md:\n${current}\n\nMake it more specific, principled, and actionable. Keep what's good.`,
      },
      ops: {
        system: `You are an expert at writing OPS.md files for AI agents. OPS.md is the operational playbook — recurring tasks, conventions, constraints, and workflows the agent must follow. It answers "how does this agent operate day-to-day?". Be concrete and specific. Return ONLY the OPS.md content, no preamble, no markdown code fences.`,
        generate: `Write an OPS.md for an agent named "${agent.name}".\n\nMission: ${agent.mission}\n\nDefine its recurring tasks, key conventions, constraints, and operational workflows.`,
        improve: `Improve this OPS.md for an agent named "${agent.name}" with mission: "${agent.mission}".\n\nCurrent OPS.md:\n${current}\n\nMake it more actionable and complete. Keep what's good.`,
      },
      tools: {
        system: `You are an expert at writing TOOLS.md files for AI agents. TOOLS.md documents the tools, APIs, endpoints, and environment context available to the agent. It answers "what can this agent use and where?". Be precise and useful. Return ONLY the TOOLS.md content, no preamble, no markdown code fences.`,
        generate: `Write a TOOLS.md for an agent named "${agent.name}".\n\nMission: ${agent.mission}\n\nDocument the tools, APIs, and environment context this agent would typically have access to for its role.`,
        improve: `Improve this TOOLS.md for an agent named "${agent.name}" with mission: "${agent.mission}".\n\nCurrent TOOLS.md:\n${current}\n\nMake it more complete and precise. Keep what's good.`,
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
      console.error('[agents] generate-workspace-file error:', err);
      res.status(500).json({ error: 'Generation failed' });
    }
  });

  router.post('/:id/sync', (req, res) => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    if (!agent.gitSync && !agent.worktreeOf) {
      res.status(400).json({ error: 'No git sync configured for this agent' }); return;
    }

    const now = new Date().toISOString();
    const updateParams: Parameters<typeof agentService.updateAgent>[1] = {};

    if (agent.gitSync) {
      // Full gitSync config: clone/update base repo + set up worktree
      const result = syncAgentRepo(agent.workspacePath, agent.worktreeOf, agent.gitSync);
      updateParams.gitSync = {
        ...agent.gitSync,
        lastSyncAt: now,
        lastSyncStatus: result.ok ? 'ok' : 'error',
        lastSyncError: result.error,
      };
      if (result.newWorktreeOf) updateParams.worktreeOf = result.newWorktreeOf;
      const updated = agentService.updateAgent(req.params.id, updateParams);
      if (updated) io.emit('agent:updated', agentService.toClientAgent(updated));
      if (result.ok) { res.json({ ok: true, syncedAt: now }); }
      else { res.status(422).json({ ok: false, error: result.error }); }
    } else {
      // worktreeOf only: fetch from base repo's origin and reset worktree
      const result = syncWorktreeFromBase(agent.workspacePath, agent.worktreeOf!);
      const updated = agentService.updateAgent(req.params.id, updateParams);
      if (updated) io.emit('agent:updated', agentService.toClientAgent(updated));
      if (result.ok) { res.json({ ok: true, syncedAt: now }); }
      else { res.status(422).json({ ok: false, error: result.error }); }
    }
  });

  router.delete('/:id', (req, res) => {
    const deleted = agentService.deleteAgent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    deleteSchedulesForAgent(req.params.id);
    io.emit('agent:deleted', { agentId: req.params.id });
    io.emit('team:list', agentService.getTeamList());
    res.status(204).send();
  });

  return router;
}

export function createTeamsRouter(io: Server) {
  const router = Router();

  router.patch('/:teamId', (req, res) => {
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const newTeamId = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (newTeamId === req.params.teamId) { res.json({ ok: true }); return; }
    agentService.renameTeam(req.params.teamId, newTeamId);
    io.emit('team:list', agentService.getTeamList());
    res.json({ ok: true, newTeamId });
  });

  router.post('/:teamId/save-as-template', (req, res) => {
    const teamAgents = agentService.getAgentsByTeam(req.params.teamId);
    if (teamAgents.length === 0) {
      res.status(400).json({ error: 'Team has no agents' });
      return;
    }
    const team = agentService.getTeamList().find((t) => t.id === req.params.teamId);
    const agentTemplateIds: string[] = [];
    for (const agent of teamAgents) {
      const tmpl = templateService.createAgentTemplate({
        name: agent.name,
        mission: agent.mission,
        avatarColor: agent.avatarColor,
      });
      fileService.snapshotWorkspace(agent.workspacePath, templateService.getAgentTemplateWorkspacePath(tmpl.id));
      agentTemplateIds.push(tmpl.id);
    }
    const teamTemplate = templateService.createTeamTemplate({
      name: team?.name ?? req.params.teamId,
      agentTemplateIds,
    });
    res.status(201).json(teamTemplate);
  });

  router.delete('/:teamId', (req, res) => {
    const { teamId } = req.params;
    const deletedIds = agentService.deleteTeam(teamId);
    for (const agentId of deletedIds) {
      deleteSchedulesForAgent(agentId);
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
