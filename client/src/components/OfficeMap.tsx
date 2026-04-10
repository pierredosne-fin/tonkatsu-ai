import { useState, useRef, useEffect, useCallback } from 'react';
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

interface DelegationLine {
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

export function OfficeMap({ onAgentClick, onEmptyRoomClick }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const activeDelegations = useAgentStore((s) => s.activeDelegations);
  const swapAgentRooms = useAgentStore((s) => s.swapAgentRooms);
  const moveAgentRoom = useSocketStore((s) => s.moveAgentRoom);

  const [dragSourceRoomId, setDragSourceRoomId] = useState<string | null>(null);
  const [dropTargetRoomId, setDropTargetRoomId] = useState<string | null>(null);
  const [lines, setLines] = useState<DelegationLine[]>([]);

  const gridRef = useRef<HTMLDivElement>(null);

  const teamAgents = currentTeamId
    ? agents.filter((a) => a.teamId === currentTeamId)
    : agents;

  const agentByRoom = new Map(teamAgents.map((a) => [a.roomId, a]));

  const computeLines = useCallback(() => {
    if (!gridRef.current || activeDelegations.size === 0) {
      setLines([]);
      return;
    }
    const gridRect = gridRef.current.getBoundingClientRect();
    const result: DelegationLine[] = [];
    for (const [fromAgentId, toAgentId] of activeDelegations.entries()) {
      const fromAgent = teamAgents.find((a) => a.id === fromAgentId);
      const toAgent = teamAgents.find((a) => a.id === toAgentId);
      if (!fromAgent || !toAgent) continue;
      const fromEl = gridRef.current.querySelector<HTMLElement>(`[data-room-id="${fromAgent.roomId}"]`);
      const toEl = gridRef.current.querySelector<HTMLElement>(`[data-room-id="${toAgent.roomId}"]`);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      result.push({
        x1: fr.left - gridRect.left + fr.width / 2,
        y1: fr.top  - gridRect.top  + fr.height / 2,
        x2: tr.left - gridRect.left + tr.width / 2,
        y2: tr.top  - gridRect.top  + tr.height / 2,
        color: fromAgent.avatarColor,
      });
    }
    setLines(result);
  }, [activeDelegations, teamAgents]);

  useEffect(() => {
    computeLines();
  }, [computeLines]);

  useEffect(() => {
    window.addEventListener('resize', computeLines);
    return () => window.removeEventListener('resize', computeLines);
  }, [computeLines]);

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
      <div className="office-grid" ref={gridRef}>
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
        {lines.length > 0 && (
          <svg className="office-delegation-svg" aria-hidden="true">
            <defs>
              {lines.map((line, i) => (
                <marker
                  key={i}
                  id={`arrow-${i}`}
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L6,3 z" fill={line.color} opacity="0.8" />
                </marker>
              ))}
            </defs>
            {lines.map((line, i) => (
              <line
                key={i}
                x1={line.x1} y1={line.y1}
                x2={line.x2} y2={line.y2}
                stroke={line.color}
                strokeWidth="2"
                strokeDasharray="8 5"
                strokeLinecap="round"
                opacity="0.75"
                markerEnd={`url(#arrow-${i})`}
                className="delegation-dash-line"
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
