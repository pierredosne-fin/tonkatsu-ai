export type AgentStatus = 'sleeping' | 'working' | 'pending' | 'delegating';

export interface GitSync {
  remoteUrl: string;
  branch: string;
  authMethod: 'ssh' | 'system';
  sshKeyName?: string;       // filename in workspaces/.ssh/ — no secret content stored here
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  status: AgentStatus;
  roomId: string;
  teamId: string;
  workspacePath: string;
  worktreeOf?: string; // original repo path when this workspace is a git worktree
  repoUrl?: string;   // SSH git URL used to create the worktree — persisted so it can be re-cloned after sync
  sessionId?: string;  // Claude Code Agent SDK session ID for conversation continuity
  canCreateAgents?: boolean;
  pendingQuestion?: string;
  gitSync?: GitSync;
  lastActivity: Date;
  createdAt: Date;
}

export interface Room {
  id: string;
  agentId: string | null;
  gridCol: number; // 1-3
  gridRow: number; // 1-3
}

export interface AgentTemplate {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  repoUrl?: string; // SSH git URL — a worktree is created from it when spawning agents
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
  overrideSettings?: Record<string, unknown>; // merged on top of workspace settings at instantiation
  createdAt: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  agentTemplateIds: string[];
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
  createdAt: string;
}

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  tags?: string[];
  category?: string;
  createdAt: string;
}

export interface CronSchedule {
  id: string;
  agentId: string;
  cronExpression: string;
  message: string;
  enabled: boolean;
  createdAt: string;
  lastFiredAt?: string;
  expiresAt?: string; // ISO string — schedule auto-deletes when this passes
}

export interface FanOutTask {
  agent: string;
  prompt: string;
}

export interface FanOutProposal {
  id: string;
  fromAgentId: string;
  teamId: string;
  tasks: FanOutTask[];
}

export interface AgentStatusUpdate {
  agentId: string;
  status: AgentStatus;
  pendingQuestion?: string;
}

export interface AgentStreamChunk {
  agentId: string;
  chunk: string;
  done: boolean;
}

export interface UserInputPayload {
  agentId: string;
  message: string;
}
