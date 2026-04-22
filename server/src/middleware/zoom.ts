/**
 * Zoom-in access control middleware.
 *
 * Authorization model:
 *  - `x-user-id` request header identifies the caller (defaults to "anonymous").
 *  - `x-team-id` request header optionally scopes access to a single team.
 *    When present, the target agent/room must belong to that team.
 *  - All zoom attempts (allowed or denied) are written to the audit log.
 *
 * 403 body shape:
 *  { error: string, code: "ZOOM_FORBIDDEN", resourceType: "agent"|"room", resourceId: string }
 */

import type { Request, Response, NextFunction } from 'express';
import * as agentService from '../services/agentService.js';
import * as roomService from '../services/roomService.js';
import { writeAuditLog } from '../services/auditService.js';

export interface ZoomForbiddenBody {
  error: string;
  code: 'ZOOM_FORBIDDEN';
  resourceType: 'room' | 'agent';
  resourceId: string;
}

function resolveUserId(req: Request): string {
  return (req.headers['x-user-id'] as string | undefined) ?? 'anonymous';
}

function resolveTeamId(req: Request): string | undefined {
  return req.headers['x-team-id'] as string | undefined;
}

/** Gate GET /api/agents/:id — validates team membership when x-team-id is set. */
export function requireAgentZoomAccess(req: Request, res: Response, next: NextFunction): void {
  const agentId = req.params.id;
  const userId = resolveUserId(req);
  const teamId = resolveTeamId(req);
  const agent = agentService.getAgent(agentId);

  const exists = !!agent;
  const allowed = exists && (teamId === undefined || agent!.teamId === teamId);

  writeAuditLog({
    timestamp: new Date().toISOString(),
    event: 'agent:zoom-in',
    userId,
    resourceType: 'agent',
    resourceId: agentId,
    teamId,
    allowed,
    ip: req.ip,
  });

  if (!exists) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  if (!allowed) {
    const body: ZoomForbiddenBody = {
      error: 'You do not have access to this agent',
      code: 'ZOOM_FORBIDDEN',
      resourceType: 'agent',
      resourceId: agentId,
    };
    res.status(403).json(body);
    return;
  }

  next();
}

/** Gate GET /api/rooms/:id — validates team membership when x-team-id is set. */
export function requireRoomZoomAccess(req: Request, res: Response, next: NextFunction): void {
  const roomId = req.params.id;
  const userId = resolveUserId(req);
  const teamId = resolveTeamId(req);
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
    userId,
    resourceType: 'room',
    resourceId: roomId,
    teamId,
    allowed,
    ip: req.ip,
  });

  if (!exists) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  if (!allowed) {
    const body: ZoomForbiddenBody = {
      error: 'You do not have access to this room',
      code: 'ZOOM_FORBIDDEN',
      resourceType: 'room',
      resourceId: roomId,
    };
    res.status(403).json(body);
    return;
  }

  next();
}
