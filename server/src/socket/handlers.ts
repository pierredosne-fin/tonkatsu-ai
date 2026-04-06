import type { Server, Socket } from 'socket.io';
import * as agentService from '../services/agentService.js';
import { runAgentTask } from '../services/claudeService.js';

export function registerHandlers(io: Server, socket: Socket): void {
  // Send full agent + team list on connect
  socket.emit('agent:list', agentService.getAllAgents().map(agentService.toClientAgent));
  socket.emit('team:list', agentService.getTeamList());

  socket.on('agent:subscribe', ({ agentId }: { agentId: string }) => {
    socket.join(`agent:${agentId}`);
    const agent = agentService.getAgent(agentId);
    if (agent) {
      socket.emit('agent:history', { agentId, history: agent.conversationHistory });
    }
  });

  socket.on('agent:unsubscribe', ({ agentId }: { agentId: string }) => {
    socket.leave(`agent:${agentId}`);
  });

  // User sends a message — works for both pending and sleeping agents
  socket.on(
    'agent:sendMessage',
    ({ agentId, message }: { agentId: string; message: string }) => {
      const agent = agentService.getAgent(agentId);
      if (!agent || agent.status === 'working' || agent.status === 'delegating') return;

      const msg = { role: 'user' as const, content: message };
      agentService.appendMessage(agentId, msg);
      io.emit('agent:message', { agentId, message: msg });
      runAgentTask(agentId, io);
    }
  );

  // Manually sleep an agent
  socket.on('agent:sleep', ({ agentId }: { agentId: string }) => {
    agentService.abortStream(agentId);
    agentService.setStatus(agentId, 'sleeping');
    io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
  });

  // Start a fresh conversation (archives current history)
  socket.on('agent:newConversation', ({ agentId }: { agentId: string }) => {
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    agentService.newConversation(agentId);
    io.to(`agent:${agentId}`).emit('agent:history', { agentId, history: [] });
  });

  // Start a fresh conversation for every agent in a team
  socket.on('team:newConversation', ({ teamId }: { teamId: string }) => {
    const agents = agentService.getAgentsByTeam(teamId);
    for (const agent of agents) {
      if (agent.status === 'working' || agent.status === 'delegating') continue;
      agentService.newConversation(agent.id);
      io.to(`agent:${agent.id}`).emit('agent:history', { agentId: agent.id, history: [] });
    }
  });

  // List archived conversation sessions for an agent
  socket.on('agent:listSessions', ({ agentId }: { agentId: string }) => {
    const sessions = agentService.getSessionList(agentId);
    socket.emit('agent:sessions', { agentId, sessions });
  });

  // Move/swap agent rooms
  socket.on('agent:moveRoom', ({ agentId, targetRoomId }: { agentId: string; targetRoomId: string }) => {
    const moved = agentService.swapAgentRooms(agentId, targetRoomId);
    if (moved) {
      io.emit('agent:list', agentService.getAllAgents().map(agentService.toClientAgent));
    }
  });

  // Resume a specific archived session
  socket.on('agent:resumeSession', ({ agentId, file }: { agentId: string; file: string }) => {
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    const history = agentService.resumeSession(agentId, file);
    if (history !== null) {
      io.to(`agent:${agentId}`).emit('agent:history', { agentId, history });
    }
  });
}
