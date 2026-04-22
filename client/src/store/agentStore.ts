import { create } from 'zustand';
import type { Agent, AgentStatus, ConversationSession, FanOutProposal, Message, Team } from '../types';

export interface ToolEvent {
  type: 'call' | 'result';
  toolCallId: string;
  tool: string;
  input?: Record<string, string>;
  result?: string;
  timestamp: string;
}

export interface DelegationEvent {
  type: 'delegating' | 'complete';
  fromAgentId: string;
  toAgentId: string;
  toAgentName: string;
  message?: string;
  response?: string;
  timestamp: string;
}

interface AgentStore {
  agents: Agent[];
  teams: Team[];
  currentTeamId: string | null;
  selectedAgentId: string | null;
  streamBuffers: Map<string, string>;
  toolEvents: Map<string, ToolEvent[]>;
  delegationEvents: Map<string, DelegationEvent[]>;
  activeDelegations: Map<string, string>;
  toolCallCounters: Map<string, number>;
  agentHistories: Map<string, Message[]>;
  agentSessions: Map<string, ConversationSession[]>;
  pendingFanOut: FanOutProposal | null;

  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  updateAgent: (agent: Agent) => void;
  updateStatus: (agentId: string, status: AgentStatus, pendingQuestion?: string) => void;
  swapAgentRooms: (agentId1: string, agentId2: string | null, roomId1: string, roomId2: string) => void;
  appendStream: (agentId: string, chunk: string) => void;
  clearStream: (agentId: string) => void;
  selectAgent: (agentId: string | null) => void;
  setTeams: (teams: Team[]) => void;
  setCurrentTeam: (teamId: string) => void;
  addToolEvent: (agentId: string, event: ToolEvent) => void;
  clearToolEvents: (agentId: string) => void;
  addDelegationEvent: (event: DelegationEvent) => void;
  setActiveDelegation: (fromAgentId: string, toAgentId: string) => void;
  clearActiveDelegation: (fromAgentId: string) => void;
  incrementToolCounter: (agentId: string) => void;
  resetToolCounter: (agentId: string) => void;
  setAgentHistory: (agentId: string, history: Message[]) => void;
  appendAgentMessage: (agentId: string, message: Message) => void;
  clearDelegationEvents: (agentId: string) => void;
  setAgentSessions: (agentId: string, sessions: ConversationSession[]) => void;
  setPendingFanOut: (proposal: FanOutProposal | null) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  teams: [],
  currentTeamId: null,
  selectedAgentId: null,
  streamBuffers: new Map(),
  toolEvents: new Map(),
  delegationEvents: new Map(),
  activeDelegations: new Map(),
  toolCallCounters: new Map(),
  agentHistories: new Map(),
  agentSessions: new Map(),
  pendingFanOut: null,

  setAgents: (agents) => set((s) => ({
    agents: [...agents].sort((a, b) => a.roomId.localeCompare(b.roomId)),
    // Auto-select first team if none selected
    currentTeamId: s.currentTeamId ?? (agents.length > 0 ? agents[0].teamId : null),
  })),

  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent].sort((a, b) => a.roomId.localeCompare(b.roomId)),
    })),

  removeAgent: (agentId) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== agentId),
      selectedAgentId: state.selectedAgentId === agentId ? null : state.selectedAgentId,
    })),

  updateAgent: (agent) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === agent.id ? agent : a)),
    })),

  updateStatus: (agentId, status, pendingQuestion) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? { ...a, status, pendingQuestion: status === 'pending' ? pendingQuestion : undefined }
          : a
      ),
    })),

  swapAgentRooms: (agentId1, agentId2, roomId1, roomId2) =>
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.id === agentId1) return { ...a, roomId: roomId2 };
        if (agentId2 && a.id === agentId2) return { ...a, roomId: roomId1 };
        return a;
      }),
    })),

  appendStream: (agentId, chunk) =>
    set((state) => {
      const next = new Map(state.streamBuffers);
      next.set(agentId, (next.get(agentId) ?? '') + chunk);
      return { streamBuffers: next };
    }),

  clearStream: (agentId) =>
    set((state) => {
      const next = new Map(state.streamBuffers);
      next.delete(agentId);
      return { streamBuffers: next };
    }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),

  setTeams: (teams) => set((s) => ({
    teams,
    currentTeamId: s.currentTeamId ?? (teams.length > 0 ? teams[0].id : null),
  })),

  setCurrentTeam: (teamId) => set({ currentTeamId: teamId }),

  addToolEvent: (agentId, event) =>
    set((state) => {
      const next = new Map(state.toolEvents);
      next.set(agentId, [...(next.get(agentId) ?? []), event]);
      return { toolEvents: next };
    }),

  clearToolEvents: (agentId) =>
    set((state) => {
      const next = new Map(state.toolEvents);
      next.delete(agentId);
      return { toolEvents: next };
    }),

  addDelegationEvent: (event) =>
    set((state) => {
      const next = new Map(state.delegationEvents);
      const key = event.fromAgentId;
      next.set(key, [...(next.get(key) ?? []), event]);
      return { delegationEvents: next };
    }),

  setActiveDelegation: (fromAgentId, toAgentId) =>
    set((state) => {
      const next = new Map(state.activeDelegations);
      next.set(fromAgentId, toAgentId);
      return { activeDelegations: next };
    }),

  clearActiveDelegation: (fromAgentId) =>
    set((state) => {
      const next = new Map(state.activeDelegations);
      next.delete(fromAgentId);
      return { activeDelegations: next };
    }),

  incrementToolCounter: (agentId) =>
    set((state) => {
      const next = new Map(state.toolCallCounters);
      next.set(agentId, (next.get(agentId) ?? 0) + 1);
      return { toolCallCounters: next };
    }),

  resetToolCounter: (agentId) =>
    set((state) => {
      const next = new Map(state.toolCallCounters);
      next.delete(agentId);
      return { toolCallCounters: next };
    }),

  setAgentHistory: (agentId, history) =>
    set((state) => {
      const next = new Map(state.agentHistories);
      // Assign sequential fake timestamps so loaded history always sorts before live events
      next.set(agentId, history.map((m, i) => m.timestamp ? m : { ...m, timestamp: new Date(i).toISOString() }));
      return { agentHistories: next };
    }),

  appendAgentMessage: (agentId, message) =>
    set((state) => {
      const next = new Map(state.agentHistories);
      next.set(agentId, [...(next.get(agentId) ?? []), { ...message, timestamp: new Date().toISOString() }]);
      return { agentHistories: next };
    }),

  clearDelegationEvents: (agentId) =>
    set((state) => {
      const next = new Map(state.delegationEvents);
      next.delete(agentId);
      return { delegationEvents: next };
    }),

  setAgentSessions: (agentId, sessions) =>
    set((state) => {
      const next = new Map(state.agentSessions);
      next.set(agentId, sessions);
      return { agentSessions: next };
    }),

  setPendingFanOut: (proposal) => set({ pendingFanOut: proposal }),
}));
