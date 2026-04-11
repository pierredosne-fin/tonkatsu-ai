export type AgentStatus = 'sleeping' | 'working' | 'pending' | 'delegating';

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
  sessionId?: string;  // Claude Code Agent SDK session ID for conversation continuity
  canCreateAgents?: boolean;
  pendingQuestion?: string;
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
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
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
