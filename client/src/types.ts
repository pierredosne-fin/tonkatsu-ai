export type AgentStatus = 'sleeping' | 'working' | 'pending' | 'delegating' | 'broadcasting';

export interface WorkspaceSyncConfig {
  remoteUrl?: string;
  branch?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
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
  canCreateAgents?: boolean;
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
  repoUrl?: string;
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
  expiresAt?: string;
}

export interface ConversationSession {
  sessionId: string;
  summary: string;
  lastModified: number;
  firstPrompt?: string;
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

// ── Live FanOut tracking ──────────────────────────────────────────────────────

export type FanOutTaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface FanOutTaskState {
  taskId: string;
  targetAgentId: string;
  taskSnippet: string;
  status: FanOutTaskStatus;
  startedAt?: number;
  completedAt?: number;
}

export interface FanOutState {
  fanoutId: string;
  sourceAgentId: string;
  tasks: FanOutTaskState[];
  startedAt: number;
  /** true once all tasks have settled (done or failed) */
  settled: boolean;
}

// ── Socket event payloads ─────────────────────────────────────────────────────

export interface FanOutDispatchedPayload {
  fanoutId: string;
  sourceAgentId: string;
  tasks: Array<{ taskId: string; targetAgentId: string; taskSnippet: string }>;
}

export interface FanOutTaskStartedPayload {
  fanoutId: string;
  taskId: string;
  targetAgentId: string;
}

export interface FanOutTaskCompletePayload {
  fanoutId: string;
  taskId: string;
  targetAgentId: string;
  status: 'done' | 'failed';
  summary?: string;
}

export interface FanOutCompletePayload {
  fanoutId: string;
  sourceAgentId: string;
  results: Array<{ taskId: string; status: 'done' | 'failed' }>;
}
