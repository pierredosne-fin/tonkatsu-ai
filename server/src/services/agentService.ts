import { v4 as uuidv4 } from 'uuid';
import { mkdirSync, rmSync, rmdirSync, existsSync, writeFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { setCreateAgentsPermission, setupWorkspaceStructure } from './fileService.js';
import type { Agent, AgentStatus, GitSync, Message } from '../models/types.js';
import { assignRoom, freeRoom, swapRooms, resetAllRooms } from './roomService.js';
import { createWorktree, removeWorktree, pruneWorktrees, cloneRepoIfNeeded, isGitRepo } from './gitService.js';
import {
  getSessionMessages,
  listSessions as sdkListSessions,
  type SDKSessionInfo,
} from '@anthropic-ai/claude-agent-sdk';
import {
  saveAgents,
  loadAllAgents,
  DEFAULT_TEAM,
  WORKSPACES_DIR,
  teamDisplayName,
  type PersistedAgent,
} from './persistenceService.js';

const agents: Map<string, Agent> = new Map();
const activeStreams: Map<string, AbortController> = new Map();

function persist() {
  saveAgents(Array.from(agents.values()));
}

export function getAllAgents(): Agent[] {
  return Array.from(agents.values());
}

export function toClientAgent(agent: Agent): Agent {
  return agent;
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}

export function getAgentsByTeam(teamId: string): Agent[] {
  return Array.from(agents.values()).filter((a) => a.teamId === teamId);
}

export function getTeamList(): { id: string; name: string }[] {
  const ids = new Set<string>();
  for (const a of agents.values()) ids.add(a.teamId);
  return Array.from(ids).map((id) => ({ id, name: teamDisplayName(id) }));
}

export function renameTeam(oldTeamId: string, newTeamId: string): void {
  const oldDir = join(WORKSPACES_DIR, oldTeamId);
  const newDir = join(WORKSPACES_DIR, newTeamId);
  if (existsSync(oldDir)) {
    if (existsSync(newDir)) {
      // Target already exists — move old dir's contents into it, then remove old dir
      rmSync(oldDir, { recursive: true, force: true });
    } else {
      renameSync(oldDir, newDir);
    }
  }
  for (const agent of agents.values()) {
    if (agent.teamId === oldTeamId) {
      agent.teamId = newTeamId;
      agent.workspacePath = agent.workspacePath.replace(oldDir, newDir);
      if (agent.worktreeOf) agent.worktreeOf = agent.worktreeOf.replace(oldDir, newDir);
    }
  }
  persist();
  // Safety net: remove old dir if it still exists (e.g. renameSync was skipped)
  if (existsSync(oldDir)) {
    try { rmSync(oldDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function createAgent(params: {
  name: string;
  mission: string;
  avatarColor: string;
  teamId?: string;
  repoUrl?: string;
  repoBranch?: string;
  templateSlug?: string;
  canCreateAgents?: boolean;
}): Agent | null {
  const teamId = params.teamId?.trim() || DEFAULT_TEAM;
  const room = assignRoom('__temp__', teamId);
  if (!room) return null;

  const id = uuidv4();
  room.agentId = id;

  const slug = params.name.toLowerCase().replace(/\s+/g, '-');
  const teamDir = join(WORKSPACES_DIR, teamId);
  const autoPath = (params.templateSlug && params.templateSlug !== slug)
    ? join(teamDir, params.templateSlug, slug)
    : join(teamDir, slug);

  let workspacePath: string;
  let worktreeOf: string | undefined;
  let isOwnWorkspace = false;

  const repoUrl = params.repoUrl?.trim();

  if (repoUrl) {
    const clonedPath = cloneRepoIfNeeded(repoUrl, params.repoBranch?.trim());
    if (!clonedPath) {
      freeRoom(id, teamId);
      return null;
    }
    const branch = `agent/${slug}-${id.slice(0, 8)}`;
    mkdirSync(join(autoPath, '..'), { recursive: true });
    pruneWorktrees(clonedPath);
    if (createWorktree(clonedPath, autoPath, branch)) {
      workspacePath = autoPath;
      worktreeOf = clonedPath;
      isOwnWorkspace = true;
      console.log(`[git] Created worktree from remote clone at ${autoPath} (branch: ${branch})`);
    } else {
      console.warn(`[git] Worktree creation failed after cloning ${repoUrl}`);
      freeRoom(id, teamId);
      return null;
    }
  } else {
    workspacePath = autoPath;
    mkdirSync(workspacePath, { recursive: true });
    isOwnWorkspace = true;
  }

  const mcpJsonPath = join(workspacePath, '.mcp.json');
  if (!existsSync(mcpJsonPath)) {
    writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2));
  }

  if (isOwnWorkspace) {
    setupWorkspaceStructure(workspacePath, params.name, params.mission);
  }

  const agent: Agent = {
    id,
    name: params.name,
    mission: params.mission,
    avatarColor: params.avatarColor,
    status: 'sleeping',
    roomId: room.id,
    teamId,
    workspacePath,
    worktreeOf,
    repoUrl: repoUrl || undefined,
    canCreateAgents: params.canCreateAgents ?? false,
    lastActivity: new Date(),
    createdAt: new Date(),
  };

  if (agent.canCreateAgents) {
    setCreateAgentsPermission(workspacePath, true);
  }

  agents.set(id, agent);
  persist();
  return agent;
}

export function restoreAgent(persisted: PersistedAgent): Agent | null {
  const teamId = persisted.teamId || DEFAULT_TEAM;
  const room = assignRoom(persisted.id, teamId);

  if (!room) return null;
  if (room.agentId !== persisted.id) room.agentId = persisted.id;

  const agent: Agent = {
    id: persisted.id,
    name: persisted.name,
    mission: persisted.mission,
    avatarColor: persisted.avatarColor,
    status: 'sleeping',
    roomId: room.id,
    teamId,
    workspacePath: persisted.workspacePath,
    worktreeOf: persisted.worktreeOf,
    repoUrl: persisted.repoUrl,
    sessionId: persisted.sessionId,
    canCreateAgents: persisted.canCreateAgents ?? false,
    gitSync: persisted.gitSync,
    lastActivity: new Date(persisted.lastActivity),
    createdAt: new Date(persisted.createdAt),
  };

  agents.set(agent.id, agent);

  // If the workspace is a git worktree, ensure the base repo and worktree exist.
  // The base repo may be missing after a workspace re-sync on a new machine — re-clone it
  // using the persisted repoUrl if available.
  if (agent.worktreeOf) {
    if (!existsSync(agent.worktreeOf) || !isGitRepo(agent.worktreeOf)) {
      if (agent.repoUrl) {
        const cloned = cloneRepoIfNeeded(agent.repoUrl);
        if (cloned) agent.worktreeOf = cloned;
      }
    }
    if (existsSync(agent.worktreeOf) && isGitRepo(agent.worktreeOf)) {
      // A proper git worktree has a .git FILE (not directory). Check for that specifically —
      // isGitRepo() alone is insufficient because subdirectories of any git repo (like agent-conf
      // when workspaces/ is a symlink) also pass isGitRepo() via the parent's .git.
      const hasWorktreeGitFile = existsSync(join(agent.workspacePath, '.git')) &&
        !existsSync(join(agent.workspacePath, '.git', 'HEAD')); // file, not directory
      if (!hasWorktreeGitFile) {
        pruneWorktrees(agent.worktreeOf);
        const slug = agent.name.toLowerCase().replace(/\s+/g, '-');
        const branch = `agent/${slug}-${agent.id.slice(0, 8)}`;
        mkdirSync(dirname(agent.workspacePath), { recursive: true });
        createWorktree(agent.worktreeOf, agent.workspacePath, branch);
      }
    }
  }

  // Ensure settings.json permission is in sync with persisted canCreateAgents flag
  setCreateAgentsPermission(agent.workspacePath, agent.canCreateAgents ?? false);
  // Only set up workspace structure for owned workspaces (worktrees or paths under WORKSPACES_DIR)
  const isOwnWorkspace = !!agent.worktreeOf || agent.workspacePath.startsWith(WORKSPACES_DIR);
  if (isOwnWorkspace) {
    setupWorkspaceStructure(agent.workspacePath, agent.name, agent.mission);
  }
  return agent;
}

export function updateAgent(id: string, params: { name?: string; mission?: string; avatarColor?: string; canCreateAgents?: boolean; gitSync?: GitSync | null; worktreeOf?: string }): Agent | null {
  const agent = agents.get(id);
  if (!agent) return null;
  if (params.name !== undefined) agent.name = params.name;
  if (params.mission !== undefined) agent.mission = params.mission;
  if (params.avatarColor !== undefined) agent.avatarColor = params.avatarColor;
  if (params.canCreateAgents !== undefined) {
    agent.canCreateAgents = params.canCreateAgents;
    setCreateAgentsPermission(agent.workspacePath, params.canCreateAgents);
  }
  if ('gitSync' in params) {
    agent.gitSync = params.gitSync ?? undefined;
  }
  if (params.worktreeOf !== undefined) {
    agent.worktreeOf = params.worktreeOf;
  }
  persist();
  return agent;
}

export function deleteAgent(id: string): boolean {
  const agent = agents.get(id);
  if (!agent) return false;
  abortStream(id);
  freeRoom(id, agent.teamId);
  agents.delete(id);
  persist();
  if (agent.worktreeOf) {
    removeWorktree(agent.worktreeOf, agent.workspacePath);
  }
  // Clean up workspace directory if it lives under WORKSPACES_DIR
  if (agent.workspacePath.startsWith(WORKSPACES_DIR) && existsSync(agent.workspacePath)) {
    try { rmSync(agent.workspacePath, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // Prune stale worktree entries — removeWorktree can fail silently when workspacePath goes
  // through a symlink (git stores the resolved path). Prune detects the dir is gone and cleans up.
  if (agent.worktreeOf) {
    pruneWorktrees(agent.worktreeOf);
  }
  // Remove parent team dir only if it is now empty (rmdirSync fails silently if not empty)
  const teamDir = join(WORKSPACES_DIR, agent.teamId);
  if (teamDir !== WORKSPACES_DIR && existsSync(teamDir)) {
    try { rmdirSync(teamDir); } catch { /* not empty — other agents still there, leave it */ }
  }
  return true;
}

export function deleteTeam(teamId: string): string[] {
  const teamAgents = getAgentsByTeam(teamId);
  const deletedIds: string[] = [];
  for (const agent of teamAgents) {
    abortStream(agent.id);
    freeRoom(agent.id, teamId);
    agents.delete(agent.id);
    deletedIds.push(agent.id);
  }
  const teamDir = join(WORKSPACES_DIR, teamId);
  if (existsSync(teamDir)) {
    try { rmSync(teamDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  persist();
  return deletedIds;
}

export function hotReloadWorkspace(io: import('socket.io').Server): void {
  // Abort all running streams
  for (const ctrl of activeStreams.values()) ctrl.abort();
  activeStreams.clear();

  // Clear all in-memory state
  agents.clear();
  resetAllRooms();

  // Reload from disk
  const persisted = loadAllAgents();
  for (const p of persisted) {
    restoreAgent(p);
  }

  // Push fresh state to all clients
  io.emit('agent:list', Array.from(agents.values()).map(toClientAgent));
  io.emit('team:list', getTeamList());
  console.log(`[hotReload] Reloaded ${agents.size} agents from disk`);
}

export function swapAgentRooms(agentId: string, targetRoomId: string): boolean {
  const agent = agents.get(agentId);
  if (!agent) return false;
  const sourceRoomId = agent.roomId;
  if (sourceRoomId === targetRoomId) return false;
  const other = Array.from(agents.values()).find((a) => a.roomId === targetRoomId && a.teamId === agent.teamId);
  swapRooms(sourceRoomId, targetRoomId, agent.teamId);
  agent.roomId = targetRoomId;
  if (other) other.roomId = sourceRoomId;
  persist();
  return true;
}

export function setStatus(id: string, status: AgentStatus, pendingQuestion?: string): void {
  const agent = agents.get(id);
  if (!agent) return;
  agent.status = status;
  agent.lastActivity = new Date();
  if (status === 'pending' && pendingQuestion) {
    agent.pendingQuestion = pendingQuestion;
  } else {
    delete agent.pendingQuestion;
  }
}

export function setAbortController(id: string, controller: AbortController): void {
  activeStreams.set(id, controller);
}

export function abortStream(id: string): void {
  const controller = activeStreams.get(id);
  if (controller) {
    controller.abort();
    activeStreams.delete(id);
  }
}

export function clearAbortController(id: string): void {
  activeStreams.delete(id);
}

export function setSessionId(id: string, sessionId: string): void {
  const agent = agents.get(id);
  if (!agent) return;
  agent.sessionId = sessionId;
  persist();
}

export function clearSessionId(id: string): void {
  const agent = agents.get(id);
  if (!agent) return;
  delete agent.sessionId;
  persist();
}

// Fetch conversation history from SDK session storage for UI display
export async function getHistory(agentId: string): Promise<Message[]> {
  const agent = agents.get(agentId);
  if (!agent?.sessionId) return [];
  try {
    const sdkMsgs = await getSessionMessages(agent.sessionId, { dir: agent.workspacePath });
    const result: Message[] = [];
    for (const sm of sdkMsgs) {
      if (sm.type !== 'user' && sm.type !== 'assistant') continue;
      const content = (sm.message as { content?: unknown }).content;
      let text: string;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        // Skip tool result messages (internal SDK plumbing, not user-visible)
        if ((content as Array<{ type: string }>).some((b) => b.type === 'tool_result')) continue;
        text = (content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');
      } else {
        continue;
      }
      if (text.trim()) result.push({ role: sm.type as 'user' | 'assistant', content: text });
    }
    return result;
  } catch (err) {
    console.warn(`[agentService] Failed to load history for agent ${agentId}:`, err);
    return [];
  }
}

// List all SDK sessions for this agent's workspace
export async function listAgentSessions(agentId: string): Promise<SDKSessionInfo[]> {
  const agent = agents.get(agentId);
  if (!agent) return [];
  try {
    return await sdkListSessions({ dir: agent.workspacePath });
  } catch (err) {
    console.warn(`[agentService] Failed to list sessions for agent ${agentId}:`, err);
    return [];
  }
}

// Switch to a specific SDK session
export function setAgentSession(agentId: string, sessionId: string): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  agent.sessionId = sessionId;
  persist();
}

export function findAgentByName(name: string, teamId: string): Agent | undefined {
  const lower = name.toLowerCase();
  return Array.from(agents.values()).find(
    (a) => a.name.toLowerCase() === lower && a.teamId === teamId
  );
}

// Start a new conversation — just clear the session ID; SDK creates a new session on next run
export function newConversation(id: string): void {
  const agent = agents.get(id);
  if (!agent) return;
  abortStream(id);
  clearSessionId(id);
}
