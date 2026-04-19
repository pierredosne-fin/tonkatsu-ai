import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAgentStore } from './agentStore';
import { useToastStore } from './toastStore';
import type { Agent, AgentStatus, ConversationSession, Message, Team } from '../types';
import { playPending, playSleeping, playWorking, playDelegating } from '../utils/sounds';

const STATUS_LABELS: Record<AgentStatus, string> = {
  working:    '⚙️ Working…',
  pending:    '❗ Needs your input',
  sleeping:   '💤 Done',
  delegating: '📨 Waiting for agent',
};

function notifyStatusChange(agentId: string, status: AgentStatus, pendingQuestion?: string) {
  const agent = useAgentStore.getState().agents.find((a) => a.id === agentId);
  if (!agent) return;

  // In-page toast
  useToastStore.getState().push({
    agentId,
    agentName: agent.name,
    avatarColor: agent.avatarColor,
    status,
    pendingQuestion,
  });

  // OS desktop notification
  if (Notification.permission === 'granted') {
    try {
      const body = status === 'pending' && pendingQuestion ? pendingQuestion : STATUS_LABELS[status];
      new Notification(`${agent.name} — ${STATUS_LABELS[status]}`, { body, silent: true });
    } catch { /* notification not supported in this context */ }
  }

  // Sound
  if (status === 'pending') playPending();
  else if (status === 'sleeping') playSleeping();
  else if (status === 'working') playWorking();
  else if (status === 'delegating') playDelegating();
}

export async function requestDesktopNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (agentId: string, message: string) => void;
  subscribeToAgent: (agentId: string) => void;
  sleepAgent: (agentId: string) => void;
  newConversation: (agentId: string) => void;
  newTeamConversation: (teamId: string) => void;
  listSessions: (agentId: string) => void;
  resumeSession: (agentId: string, sessionId: string) => void;
  moveAgentRoom: (agentId: string, targetRoomId: string) => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,

  connect: () => {
    if (get().socket) return;

    const socket = io(import.meta.env.DEV ? 'http://localhost:3001' : '', { transports: ['websocket'] });

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('agent:list', (agents: Agent[]) => {
      useAgentStore.getState().setAgents(agents);
    });

    socket.on('agent:created', (agent: Agent) => {
      useAgentStore.getState().addAgent(agent);
    });

    socket.on('agent:updated', (agent: Agent) => {
      useAgentStore.getState().updateAgent(agent);
    });

    socket.on('agent:deleted', ({ agentId }: { agentId: string }) => {
      useAgentStore.getState().removeAgent(agentId);
    });

    socket.on('team:list', (teams: Team[]) => {
      useAgentStore.getState().setTeams(teams);
    });

    socket.on(
      'agent:statusChanged',
      ({ agentId, status, pendingQuestion }: { agentId: string; status: AgentStatus; pendingQuestion?: string }) => {
        const store = useAgentStore.getState();
        store.updateStatus(agentId, status, pendingQuestion);
        notifyStatusChange(agentId, status, pendingQuestion);
        // Reset tool counter when agent stops working
        if (status !== 'working') {
          store.resetToolCounter(agentId);
        }
        // Clear delegation link when agent is no longer delegating
        if (status !== 'delegating') {
          store.clearActiveDelegation(agentId);
        }
      }
    );

    socket.on(
      'agent:stream',
      ({ agentId, chunk, done }: { agentId: string; chunk: string; done: boolean }) => {
        if (!done && chunk) {
          useAgentStore.getState().appendStream(agentId, chunk);
        }
      }
    );

    socket.on(
      'agent:history',
      ({ agentId, history }: { agentId: string; history: Message[] }) => {
        useAgentStore.getState().setAgentHistory(agentId, history);
      }
    );

    socket.on(
      'agent:message',
      ({ agentId, message }: { agentId: string; message: Message }) => {
        useAgentStore.getState().appendAgentMessage(agentId, message);
      }
    );

    // Tool use events
    socket.on(
      'agent:toolCall',
      ({ agentId, toolCallId, tool, input }: { agentId: string; toolCallId: string; tool: string; input: Record<string, string> }) => {
        useAgentStore.getState().addToolEvent(agentId, {
          type: 'call',
          toolCallId,
          tool,
          input,
          timestamp: new Date().toISOString(),
        });
        useAgentStore.getState().incrementToolCounter(agentId);
      }
    );

    socket.on(
      'agent:toolResult',
      ({ agentId, toolCallId, tool, result }: { agentId: string; toolCallId: string; tool: string; result: string }) => {
        useAgentStore.getState().addToolEvent(agentId, {
          type: 'result',
          toolCallId,
          tool,
          result,
          timestamp: new Date().toISOString(),
        });
      }
    );

    socket.on(
      'agent:sessions',
      ({ agentId, sessions }: { agentId: string; sessions: ConversationSession[] }) => {
        useAgentStore.getState().setAgentSessions(agentId, sessions);
      }
    );

    // Delegation events
    socket.on(
      'agent:delegating',
      ({ fromAgentId, toAgentId, toAgentName, message }: { fromAgentId: string; toAgentId: string; toAgentName: string; message: string }) => {
        const store = useAgentStore.getState();
        store.addDelegationEvent({
          type: 'delegating',
          fromAgentId,
          toAgentId,
          toAgentName,
          message,
          timestamp: new Date().toISOString(),
        });
        store.setActiveDelegation(fromAgentId, toAgentId);
      }
    );

    socket.on(
      'agent:delegationComplete',
      ({ fromAgentId, toAgentId, toAgentName, response }: { fromAgentId: string; toAgentId: string; toAgentName: string; response: string }) => {
        const store = useAgentStore.getState();
        store.addDelegationEvent({
          type: 'complete',
          fromAgentId,
          toAgentId,
          toAgentName,
          response,
          timestamp: new Date().toISOString(),
        });
        store.clearActiveDelegation(fromAgentId);
      }
    );

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false });
  },

  sendMessage: (agentId, message) => {
    const { socket } = get();
    if (!socket) return;
    useAgentStore.getState().clearStream(agentId);
    useAgentStore.getState().clearToolEvents(agentId);
    useAgentStore.getState().clearDelegationEvents(agentId);
    useAgentStore.getState().resetToolCounter(agentId);
    socket.emit('agent:sendMessage', { agentId, message });
  },

  subscribeToAgent: (agentId) => {
    get().socket?.emit('agent:subscribe', { agentId });
  },

  sleepAgent: (agentId) => {
    get().socket?.emit('agent:sleep', { agentId });
  },

  newConversation: (agentId) => {
    const { socket } = get();
    if (!socket) return;
    useAgentStore.getState().clearStream(agentId);
    useAgentStore.getState().clearToolEvents(agentId);
    useAgentStore.getState().resetToolCounter(agentId);
    socket.emit('agent:newConversation', { agentId });
  },

  newTeamConversation: (teamId) => {
    const { socket } = get();
    if (!socket) return;
    // Clear client-side buffers for all agents in this team
    const agents = useAgentStore.getState().agents.filter((a) => a.teamId === teamId);
    for (const agent of agents) {
      useAgentStore.getState().clearStream(agent.id);
      useAgentStore.getState().clearToolEvents(agent.id);
      useAgentStore.getState().resetToolCounter(agent.id);
    }
    socket.emit('team:newConversation', { teamId });
  },

  listSessions: (agentId) => {
    get().socket?.emit('agent:listSessions', { agentId });
  },

  resumeSession: (agentId, sessionId) => {
    const { socket } = get();
    if (!socket) return;
    useAgentStore.getState().clearStream(agentId);
    useAgentStore.getState().clearToolEvents(agentId);
    useAgentStore.getState().resetToolCounter(agentId);
    socket.emit('agent:resumeSession', { agentId, sessionId });
  },

  moveAgentRoom: (agentId, targetRoomId) => {
    get().socket?.emit('agent:moveRoom', { agentId, targetRoomId });
  },
}));
