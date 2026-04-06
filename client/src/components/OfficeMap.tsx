import { useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import { Room } from './Room';
import type { Room as RoomType } from '../types';

const GRID_COLS = 5;
const GRID_ROWS = 2;
const ROOMS: RoomType[] = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => ({
  id: `room-${String(i + 1).padStart(2, '0')}`,
  agentId: null,
  gridCol: (i % GRID_COLS) + 1,
  gridRow: Math.floor(i / GRID_COLS) + 1,
}));

interface Props {
  onAgentClick: (agentId: string) => void;
  onEmptyRoomClick?: (roomId: string) => void;
}

export function OfficeMap({ onAgentClick, onEmptyRoomClick }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const swapAgentRooms = useAgentStore((s) => s.swapAgentRooms);
  const moveAgentRoom = useSocketStore((s) => s.moveAgentRoom);

  const [dragSourceRoomId, setDragSourceRoomId] = useState<string | null>(null);
  const [dropTargetRoomId, setDropTargetRoomId] = useState<string | null>(null);

  const teamAgents = currentTeamId
    ? agents.filter((a) => a.teamId === currentTeamId)
    : agents;

  const agentByRoom = new Map(teamAgents.map((a) => [a.roomId, a]));

  const handleDragStart = (roomId: string) => setDragSourceRoomId(roomId);

  const handleDragEnd = () => {
    setDragSourceRoomId(null);
    setDropTargetRoomId(null);
  };

  const handleDrop = (targetRoomId: string) => {
    if (!dragSourceRoomId || dragSourceRoomId === targetRoomId) return;
    const dragAgent = agentByRoom.get(dragSourceRoomId);
    if (!dragAgent) return;
    const targetAgent = agentByRoom.get(targetRoomId) ?? null;
    swapAgentRooms(dragAgent.id, targetAgent?.id ?? null, dragSourceRoomId, targetRoomId);
    moveAgentRoom(dragAgent.id, targetRoomId);
    setDragSourceRoomId(null);
    setDropTargetRoomId(null);
  };

  return (
    <div className="office-map">
      <div className="office-grid">
        {ROOMS.map((room) => (
          <Room
            key={room.id}
            room={room}
            agent={agentByRoom.get(room.id)}
            onAgentClick={onAgentClick}
            onEmptyRoomClick={!agentByRoom.get(room.id) && onEmptyRoomClick ? () => onEmptyRoomClick(room.id) : undefined}
            isDragging={dragSourceRoomId === room.id}
            isDropTarget={dropTargetRoomId === room.id && dragSourceRoomId !== room.id}
            onDragStart={() => handleDragStart(room.id)}
            onDragEnd={handleDragEnd}
            onDragEnter={() => setDropTargetRoomId(room.id)}
            onDragLeave={() => setDropTargetRoomId((prev) => (prev === room.id ? null : prev))}
            onDrop={() => handleDrop(room.id)}
          />
        ))}
      </div>
    </div>
  );
}
