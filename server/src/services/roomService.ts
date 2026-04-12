import type { Room } from '../models/types.js';

// Per-team room maps: teamId → roomId → Room
const teamRooms: Map<string, Map<string, Room>> = new Map();

const GRID_COLS = 5;
const GRID_ROWS = 3;

function createRoomsForTeam(): Map<string, Room> {
  const rooms = new Map<string, Room>();
  for (let row = 1; row <= GRID_ROWS; row++) {
    for (let col = 1; col <= GRID_COLS; col++) {
      const id = `room-${String((row - 1) * GRID_COLS + col).padStart(2, '0')}`;
      rooms.set(id, { id, agentId: null, gridCol: col, gridRow: row });
    }
  }
  return rooms;
}

function getTeamRooms(teamId: string): Map<string, Room> {
  if (!teamRooms.has(teamId)) teamRooms.set(teamId, createRoomsForTeam());
  return teamRooms.get(teamId)!;
}

export function getRoomsByTeam(teamId: string): Room[] {
  return Array.from(getTeamRooms(teamId).values());
}

export function getAllRooms(): Room[] {
  const all: Room[] = [];
  for (const rooms of teamRooms.values()) all.push(...rooms.values());
  return all;
}

export function assignRoom(agentId: string, teamId: string): Room | null {
  for (const room of getTeamRooms(teamId).values()) {
    if (room.agentId === null) {
      room.agentId = agentId;
      return room;
    }
  }
  return null;
}

export function freeRoom(agentId: string, teamId: string): void {
  for (const room of getTeamRooms(teamId).values()) {
    if (room.agentId === agentId) {
      room.agentId = null;
      return;
    }
  }
}

export function claimRoom(roomId: string, agentId: string, teamId: string): Room | null {
  const room = getTeamRooms(teamId).get(roomId);
  if (!room || room.agentId !== null) return null;
  room.agentId = agentId;
  return room;
}

export function hasVacantRoom(teamId: string): boolean {
  return Array.from(getTeamRooms(teamId).values()).some((r) => r.agentId === null);
}

export function resetAllRooms(): void {
  teamRooms.clear();
}

export function swapRooms(roomId1: string, roomId2: string, teamId: string): boolean {
  const rooms = getTeamRooms(teamId);
  const room1 = rooms.get(roomId1);
  const room2 = rooms.get(roomId2);
  if (!room1 || !room2) return false;
  const temp = room1.agentId;
  room1.agentId = room2.agentId;
  room2.agentId = temp;
  return true;
}
