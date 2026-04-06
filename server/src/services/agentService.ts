import { v4 as uuidv4 } from 'uuid';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { Agent, AgentStatus, Message } from '../models/types.js';
import { assignRoom, freeRoom, swapRooms } from './roomService.js';
import { isGitRepo, createWorktree, removeWorktree } from './gitService.js';
import {
  saveAgents,
  saveHistory,
  loadHistory,
  archiveHistory,
  listSessions,
  loadHistoryFromFile,
  writeFullHistory,
  DEFAULT_TEAM,
  WORKSPACES_DIR,
  teamDisplayName,
  type PersistedAgent,
  type ConversationSession,
} from './persistenceService.js';

const agents: Map<string, Agent> = new Map();
const activeStreams: Map<string, AbortController> = new Map();

function persist() {
  saveAgents(Array.from(agents.values()));
}

export function getAllAgents(): Agent[] {
  return Array.from(agents.values());
}

// Strip conversationHistory before sending to client
export function toClientAgent(agent: Agent): Omit<Agent, 'conversationHistory'> {
  const { conversationHistory: _, ...rest } = agent;
  return rest;
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

export function createAgent(params: {
  name: string;
  mission: string;
  avatarColor: string;
  teamId?: string;
  workspacePath?: string;
  templateSlug?: string;
}): Agent | null {
  const teamId = params.teamId?.trim() || DEFAULT_TEAM;
  const room = assignRoom('__temp__', teamId);
  if (!room) return null;

  const id = uuidv4();
  room.agentId = id;

  const slug = params.name.toLowerCase().replace(/\s+/g, '-');
  const teamDir = teamId === DEFAULT_TEAM ? WORKSPACES_DIR : join(WORKSPACES_DIR, teamId);
  // If spawned from a template, nest workspace under <teamDir>/<templateSlug>/<agentSlug>
  const autoPath = params.templateSlug
    ? join(teamDir, params.templateSlug, slug)
    : join(teamDir, slug);
  const externalPath = params.workspacePath?.trim();

  let workspacePath: string;
  let worktreeOf: string | undefined;

  if (externalPath) {
    // External workspace provided — create a git worktree if it's a git repo
    if (isGitRepo(externalPath)) {
      const branch = `agent/${slug}-${id.slice(0, 8)}`;
      if (createWorktree(externalPath, autoPath, branch)) {
        workspacePath = autoPath;
        worktreeOf = externalPath;
        console.log(`[git] Created worktree at ${autoPath} (branch: ${branch})`);
      } else {
        // Worktree creation failed — fall back to using the external path directly
        workspacePath = externalPath;
        mkdirSync(workspacePath, { recursive: true });
      }
    } else {
      workspacePath = externalPath;
      mkdirSync(workspacePath, { recursive: true });
    }
  } else {
    workspacePath = autoPath;
    mkdirSync(workspacePath, { recursive: true });
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
    conversationHistory: [],
    lastActivity: new Date(),
    createdAt: new Date(),
  };

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
    conversationHistory: loadHistory(persisted.workspacePath),
    lastActivity: new Date(persisted.lastActivity),
    createdAt: new Date(persisted.createdAt),
  };

  agents.set(agent.id, agent);
  return agent;
}

export function deleteAgent(id: string): boolean {
  const agent = agents.get(id);
  if (!agent) return false;
  abortStream(id);
  freeRoom(id, agent.teamId);
  agents.delete(id);
  persist();
  // Clean up git worktree if one was created for this agent
  if (agent.worktreeOf) {
    removeWorktree(agent.worktreeOf, agent.workspacePath);
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
  // Remove team folder from disk
  const teamDir = join(WORKSPACES_DIR, teamId);
  if (existsSync(teamDir)) {
    try { rmSync(teamDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  persist();
  return deletedIds;
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

export function appendMessage(id: string, message: Message): void {
  const agent = agents.get(id);
  if (!agent) return;
  agent.conversationHistory.push(message);
  saveHistory(agent.workspacePath, message);
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

export function newConversation(id: string): void {
  const agent = agents.get(id);
  if (!agent) return;
  abortStream(id);
  archiveHistory(agent.workspacePath);
  agent.conversationHistory = [];
}

export function getSessionList(id: string): ConversationSession[] {
  const agent = agents.get(id);
  if (!agent) return [];
  return listSessions(agent.workspacePath);
}

export function resumeSession(id: string, file: string): Message[] | null {
  const agent = agents.get(id);
  if (!agent) return null;
  const filePath = join(agent.workspacePath, file);
  const history = loadHistoryFromFile(filePath);
  // Archive current conversation if it has messages
  if (agent.conversationHistory.length > 0) {
    archiveHistory(agent.workspacePath);
  }
  writeFullHistory(agent.workspacePath, history);
  agent.conversationHistory = [...history];
  return history;
}
