/**
 * zoomService — scoped Socket.IO subscriptions for detail-level agent events.
 *
 * Room naming convention:
 *   agent:zoomed:{agentId}  — clients zoomed into a specific agent
 *   room:detail:{roomId}    — clients zoomed into a specific grid room
 *
 * High-frequency stream chunks are throttled (THROTTLE_MS) to avoid flooding
 * clients. Non-stream detail events (toolCall, toolResult) are emitted immediately.
 *
 * Memory-leak safety: Socket.IO removes sockets from rooms automatically on
 * disconnect. Throttle timers are keyed by agentId and cleared when the stream
 * ends (done=true), so they never outlive a task.
 */

import type { Server } from 'socket.io';
import * as agentService from './agentService.js';

/** Milliseconds between flushed stream-chunk batches per agent. */
const THROTTLE_MS = 50;

// Accumulated chunks waiting for the next flush, keyed by agentId.
const pendingChunks = new Map<string, string>();
// Active flush timers, keyed by agentId.
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Emit a streaming token chunk to all zoomed clients for this agent.
 * Chunks are batched and flushed every THROTTLE_MS ms.
 * Calling with done=true flushes any pending chunk immediately, then signals completion.
 */
export function emitThrottledStream(
  io: Server,
  agentId: string,
  chunk: string,
  done: boolean,
): void {
  if (done) {
    // Flush any remaining accumulated text before signalling completion.
    const timer = flushTimers.get(agentId);
    if (timer !== undefined) {
      clearTimeout(timer);
      flushTimers.delete(agentId);
    }
    const pending = pendingChunks.get(agentId) ?? '';
    pendingChunks.delete(agentId);
    if (pending) {
      emitToZoomedRooms(io, agentId, 'agent:stream', { agentId, chunk: pending, done: false });
    }
    emitToZoomedRooms(io, agentId, 'agent:stream', { agentId, chunk: '', done: true });
    return;
  }

  // Accumulate the chunk.
  pendingChunks.set(agentId, (pendingChunks.get(agentId) ?? '') + chunk);

  // Schedule a flush if one is not already pending.
  if (!flushTimers.has(agentId)) {
    const timer = setTimeout(() => {
      flushTimers.delete(agentId);
      const accumulated = pendingChunks.get(agentId) ?? '';
      pendingChunks.delete(agentId);
      if (accumulated) {
        emitToZoomedRooms(io, agentId, 'agent:stream', { agentId, chunk: accumulated, done: false });
      }
    }, THROTTLE_MS);
    flushTimers.set(agentId, timer);
  }
}

/**
 * Emit a detail event immediately to all zoomed clients for this agent.
 * Events are sent to:
 *   - `agent:zoomed:{agentId}` (clients who called agent:zoom-in)
 *   - `room:detail:{roomId}`   (clients who called room:zoom-in for the agent's room)
 */
export function emitToZoomedRooms(
  io: Server,
  agentId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  io.to(`agent:zoomed:${agentId}`).emit(event, payload);
  const agent = agentService.getAgent(agentId);
  if (agent?.roomId) {
    io.to(`room:detail:${agent.roomId}`).emit(event, payload);
  }
}
