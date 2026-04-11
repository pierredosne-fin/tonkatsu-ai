import type { Server, Socket } from 'socket.io';
import * as agentService from '../services/agentService.js';
import { runAgentTask } from '../services/claudeService.js';

export function registerHandlers(io: Server, socket: Socket): void {
  // Send full agent + team list on connect
  socket.emit('agent:list', agentService.getAllAgents().map(agentService.toClientAgent));
  socket.emit('team:list', agentService.getTeamList());

  socket.on('agent:subscribe', ({ agentId }: { agentId: string }) => {
    socket.join(`agent:${agentId}`);
    agentService.getHistory(agentId)
      .then((history) => socket.emit('agent:history', { agentId, history }))
      .catch((err) => console.error(`[socket] agent:subscribe error for ${agentId}:`, err));
  });

  socket.on('agent:unsubscribe', ({ agentId }: { agentId: string }) => {
    socket.leave(`agent:${agentId}`);
  });

  socket.on('agent:sendMessage', ({ agentId, message }: { agentId: string; message: string }) => {
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    io.emit('agent:message', { agentId, message: { role: 'user', content: message } });
    runAgentTask(agentId, io, message).catch((err) =>
      console.error(`[socket] runAgentTask error for ${agentId}:`, err)
    );
  });

  socket.on('agent:sleep', ({ agentId }: { agentId: string }) => {
    agentService.abortStream(agentId);
    agentService.setStatus(agentId, 'sleeping');
    io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
  });

  socket.on('agent:newConversation', ({ agentId }: { agentId: string }) => {
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    agentService.newConversation(agentId);
    io.to(`agent:${agentId}`).emit('agent:history', { agentId, history: [] });
  });

  socket.on('team:newConversation', ({ teamId }: { teamId: string }) => {
    const agents = agentService.getAgentsByTeam(teamId);
    for (const agent of agents) {
      if (agent.status === 'working' || agent.status === 'delegating') continue;
      agentService.newConversation(agent.id);
      io.to(`agent:${agent.id}`).emit('agent:history', { agentId: agent.id, history: [] });
    }
  });

  socket.on('agent:listSessions', ({ agentId }: { agentId: string }) => {
    agentService.listAgentSessions(agentId)
      .then((sessions) => socket.emit('agent:sessions', { agentId, sessions }))
      .catch((err) => console.error(`[socket] agent:listSessions error for ${agentId}:`, err));
  });

  socket.on('agent:moveRoom', ({ agentId, targetRoomId }: { agentId: string; targetRoomId: string }) => {
    const moved = agentService.swapAgentRooms(agentId, targetRoomId);
    if (moved) {
      io.emit('agent:list', agentService.getAllAgents().map(agentService.toClientAgent));
    }
  });

  socket.on('agent:resumeSession', ({ agentId, sessionId }: { agentId: string; sessionId: string }) => {
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    agentService.setAgentSession(agentId, sessionId);
    agentService.getHistory(agentId)
      .then((history) => io.to(`agent:${agentId}`).emit('agent:history', { agentId, history }))
      .catch((err) => console.error(`[socket] agent:resumeSession error for ${agentId}:`, err));
  });
}
