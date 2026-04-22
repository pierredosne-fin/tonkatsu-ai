import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import type { Agent, Room } from '../models/types.js';

// ── Response shape types ─────────────────────────────────────────────────────

export interface RoomSummary {
  id: string;
  gridCol: number;
  gridRow: number;
  teamId: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  status: Agent['status'];
  roomId: string;
  teamId: string;
  canCreateAgents: boolean;
  repoUrl: string | undefined;
  sessionId: string | undefined;
  pendingQuestion: string | undefined;
  lastActivity: string;
  createdAt: string;
}

export interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface RoomDetailResponse {
  room: RoomSummary;
  agent: AgentSummary | null;
  recentMessages: MessageEntry[];
  pagination: Pagination;
}

// Sessions are passed through as-is from the SDK — type inferred from agentService.
type SessionList = Awaited<ReturnType<typeof agentService.listAgentSessions>>;

export interface AgentDetailResponse {
  agent: AgentSummary;
  memory: { content: string | null };
  history: {
    messages: MessageEntry[];
    pagination: Pagination;
  };
  sessions: SessionList;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toAgentSummary(agent: Agent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    mission: agent.mission,
    avatarColor: agent.avatarColor,
    status: agent.status,
    roomId: agent.roomId,
    teamId: agent.teamId,
    canCreateAgents: agent.canCreateAgents ?? false,
    repoUrl: agent.repoUrl,
    sessionId: agent.sessionId,
    pendingQuestion: agent.pendingQuestion,
    lastActivity: agent.lastActivity instanceof Date
      ? agent.lastActivity.toISOString()
      : String(agent.lastActivity),
    createdAt: agent.createdAt instanceof Date
      ? agent.createdAt.toISOString()
      : String(agent.createdAt),
  };
}

function parsePaginationParams(req: Request): { limit: number; offset: number } {
  const rawLimit = parseInt(String(req.query.limit ?? '20'), 10);
  const rawOffset = parseInt(String(req.query.offset ?? '0'), 10);
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
  const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);
  return { limit, offset };
}

function paginateMessages(
  messages: MessageEntry[],
  limit: number,
  offset: number,
): { messages: MessageEntry[]; pagination: Pagination } {
  return {
    messages: messages.slice(offset, offset + limit),
    pagination: { total: messages.length, limit, offset },
  };
}

function readMemoryMd(workspacePath: string): string | null {
  const memPath = join(workspacePath, 'MEMORY.md');
  if (!existsSync(memPath)) return null;
  try {
    return readFileSync(memPath, 'utf-8');
  } catch {
    return null;
  }
}

// ── Router factory ───────────────────────────────────────────────────────────

/**
 * Mount at `/api` so that:
 *   GET /api/rooms/:id/detail
 *   GET /api/agents/:id/detail
 */
export function createDetailRouter(_io: Server): Router {
  const router = Router();

  /**
   * GET /api/rooms/:id/detail?teamId=<id>&limit=<n>&offset=<n>
   *
   * Full room snapshot: room metadata, the occupying agent (if any), and the
   * agent's recent conversation messages (paginated).
   *
   * `teamId` defaults to `"default"` when omitted. Room IDs are per-team
   * (`room-01` … `room-15`), so the query param is required for multi-team
   * deployments.
   */
  router.get('/rooms/:id/detail', async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params.id;
    const teamId =
      typeof req.query.teamId === 'string' && req.query.teamId.trim()
        ? req.query.teamId.trim()
        : 'default';
    const { limit, offset } = parsePaginationParams(req);

    const teamRooms: Room[] = roomService.getRoomsByTeam(teamId);
    const room = teamRooms.find((r) => r.id === roomId);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const agent = room.agentId ? agentService.getAgent(room.agentId) : undefined;

    const rawMessages: MessageEntry[] = agent
      ? await agentService.getHistory(agent.id)
      : [];

    const { messages: recentMessages, pagination } = paginateMessages(rawMessages, limit, offset);

    const body: RoomDetailResponse = {
      room: { id: room.id, gridCol: room.gridCol, gridRow: room.gridRow, teamId },
      agent: agent ? toAgentSummary(agent) : null,
      recentMessages,
      pagination,
    };

    res.json(body);
  });

  /**
   * GET /api/agents/:id/detail?limit=<n>&offset=<n>
   *
   * Full agent snapshot: agent metadata, workspace MEMORY.md content,
   * paginated conversation history, and available SDK sessions.
   */
  router.get('/agents/:id/detail', async (req: Request, res: Response): Promise<void> => {
    const agent = agentService.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req);

    const [rawHistory, sessions] = await Promise.all([
      agentService.getHistory(agent.id),
      agentService.listAgentSessions(agent.id),
    ]);

    const { messages, pagination } = paginateMessages(rawHistory, limit, offset);

    const body: AgentDetailResponse = {
      agent: toAgentSummary(agent),
      memory: { content: readMemoryMd(agent.workspacePath) },
      history: { messages, pagination },
      sessions,
    };

    res.json(body);
  });

  return router;
}
