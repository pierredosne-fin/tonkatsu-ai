import type { Server, Socket } from 'socket.io';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import { runAgentTask } from '../services/claudeService.js';
import { READ_ONLY } from '../config.js';
import { writeAuditLog } from '../services/auditService.js';
import { checkSocketRateLimit } from '../middleware/rateLimit.js';

interface ZoomAuth {
  userId?: string;
  teamId?: string;
}

function resolveSocketUser(socket: Socket): ZoomAuth {
  const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
  return {
    userId: typeof auth['userId'] === 'string' ? auth['userId'] : 'anonymous',
    teamId: typeof auth['teamId'] === 'string' ? auth['teamId'] : undefined,
  };
}

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
    if (READ_ONLY) return;
    agentService.abortStream(agentId);
    agentService.setStatus(agentId, 'sleeping');
    io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
  });

  socket.on('agent:newConversation', ({ agentId }: { agentId: string }) => {
    if (READ_ONLY) return;
    const agent = agentService.getAgent(agentId);
    if (!agent || agent.status === 'working' || agent.status === 'delegating') return;
    agentService.newConversation(agentId);
    io.to(`agent:${agentId}`).emit('agent:history', { agentId, history: [] });
  });

  socket.on('team:newConversation', ({ teamId }: { teamId: string }) => {
    if (READ_ONLY) return;
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
    if (READ_ONLY) return;
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

  // ── Zoom-in authorization gates ───────────────────────────────────────────

  socket.on('agent:zoom-in', ({ agentId }: { agentId: string }) => {
    const { userId, teamId } = resolveSocketUser(socket);

    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('zoom:error', {
        error: 'Too many zoom requests',
        code: 'RATE_LIMIT_EXCEEDED',
        resourceType: 'agent',
        resourceId: agentId,
      });
      return;
    }

    const agent = agentService.getAgent(agentId);
    const exists = !!agent;
    const allowed = exists && (teamId === undefined || agent!.teamId === teamId);

    writeAuditLog({
      timestamp: new Date().toISOString(),
      event: 'agent:zoom-in',
      userId: userId ?? 'anonymous',
      resourceType: 'agent',
      resourceId: agentId,
      teamId,
      allowed,
    });

    if (!exists) {
      socket.emit('zoom:error', {
        error: 'Agent not found',
        code: 'NOT_FOUND',
        resourceType: 'agent',
        resourceId: agentId,
      });
      return;
    }

    if (!allowed) {
      socket.emit('zoom:error', {
        error: 'You do not have access to this agent',
        code: 'ZOOM_FORBIDDEN',
        resourceType: 'agent',
        resourceId: agentId,
      });
      return;
    }

    socket.emit('agent:zoom-in:ok', { agent: agentService.toClientAgent(agent!) });
  });

  socket.on('room:zoom-in', ({ roomId }: { roomId: string }) => {
    const { userId, teamId } = resolveSocketUser(socket);

    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('zoom:error', {
        error: 'Too many zoom requests',
        code: 'RATE_LIMIT_EXCEEDED',
        resourceType: 'room',
        resourceId: roomId,
      });
      return;
    }

    const room = roomService.getAllRooms().find((r) => r.id === roomId);
    const exists = !!room;
    let allowed = exists;
    if (allowed && teamId !== undefined && room!.agentId) {
      const occupant = agentService.getAgent(room!.agentId);
      allowed = !occupant || occupant.teamId === teamId;
    }

    writeAuditLog({
      timestamp: new Date().toISOString(),
      event: 'room:zoom-in',
      userId: userId ?? 'anonymous',
      resourceType: 'room',
      resourceId: roomId,
      teamId,
      allowed,
    });

    if (!exists) {
      socket.emit('zoom:error', {
        error: 'Room not found',
        code: 'NOT_FOUND',
        resourceType: 'room',
        resourceId: roomId,
      });
      return;
    }

    if (!allowed) {
      socket.emit('zoom:error', {
        error: 'You do not have access to this room',
        code: 'ZOOM_FORBIDDEN',
        resourceType: 'room',
        resourceId: roomId,
      });
      return;
    }

    socket.emit('room:zoom-in:ok', { room });
  });
}
