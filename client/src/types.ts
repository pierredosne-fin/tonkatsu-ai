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
  worktreeOf?: string;
  pendingQuestion?: string;
  lastActivity: string;
  createdAt: string;
}

export interface Room {
  id: string;
  agentId: string | null;
  gridCol: number;
  gridRow: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  createdAt: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  agentTemplateIds: string[];
  createdAt: string;
}

export interface ConversationSession {
  file: string;
  isCurrent: boolean;
  messageCount: number;
  label: string;
}
