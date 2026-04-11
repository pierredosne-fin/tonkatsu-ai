import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import { Room } from './Room';
import type { Agent, Room as RoomType } from '../types';

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

interface DragState {
  agent: Agent;
  sourceRoomId: string;
  x: number;
  y: number;
}

export function OfficeMap({ onAgentClick, onEmptyRoomClick }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const activeDelegations = useAgentStore((s) => s.activeDelegations);
  const swapAgentRooms = useAgentStore((s) => s.swapAgentRooms);
  const moveAgentRoom = useSocketStore((s) => s.moveAgentRoom);

  const handleRenameAgent = async (agentId: string, name: string) => {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  };

  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const [lines, setLines] = useState<DelegationLine[]>([]);

  // Refs so event handlers always see the latest values without re-registering
  const hoverRoomRef = useRef<string | null>(null);
  const agentByRoomRef = useRef<Map<string, Agent>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const teamAgents = currentTeamId
    ? agents.filter((a) => a.teamId === currentTeamId)
    : agents;

  const agentByRoom = new Map(teamAgents.map((a) => [a.roomId, a]));
  agentByRoomRef.current = agentByRoom;

  // ── Delegation lines ──────────────────────────────────────────────────────

  const computeLines = useCallback(() => {
    if (!gridRef.current || activeDelegations.size === 0) { setLines([]); return; }
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

  useEffect(() => { computeLines(); }, [computeLines]);
  useEffect(() => {
    window.addEventListener('resize', computeLines);
    return () => window.removeEventListener('resize', computeLines);
  }, [computeLines]);

  // ── Custom mouse drag ─────────────────────────────────────────────────────

  const startDrag = useCallback((agent: Agent, sourceRoomId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const state = { agent, sourceRoomId, x: e.clientX, y: e.clientY };
    dragRef.current = state;
    setDrag(state);
    document.body.classList.add('is-dragging');
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const next = { ...dragRef.current!, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);

      // Hide the ghost so elementFromPoint can see what's underneath
      const ghostEl = document.querySelector('.drag-ghost') as HTMLElement | null;
      if (ghostEl) ghostEl.style.display = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (ghostEl) ghostEl.style.display = '';

      const id = el?.closest('[data-room-id]')?.getAttribute('data-room-id') ?? null;
      hoverRoomRef.current = id;
      setHoverRoomId(id);
    };

    const onUp = () => {
      const d = dragRef.current;
      const hr = hoverRoomRef.current;
      if (d && hr && hr !== d.sourceRoomId) {
        const targetAgent = agentByRoomRef.current.get(hr) ?? null;
        swapAgentRooms(d.agent.id, targetAgent?.id ?? null, d.sourceRoomId, hr);
        moveAgentRoom(d.agent.id, hr);
      }
      dragRef.current = null;
      hoverRoomRef.current = null;
      setDrag(null);
      setHoverRoomId(null);
      document.body.classList.remove('is-dragging');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag?.agent.id, swapAgentRooms, moveAgentRoom]);

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
            isDragging={drag?.sourceRoomId === room.id}
            isDropTarget={hoverRoomId === room.id && drag?.sourceRoomId !== room.id}
            onMouseDown={(agent, e) => startDrag(agent, room.id, e)}
            onRenameAgent={handleRenameAgent}
          />
        ))}

        {lines.length > 0 && (
          <svg className="office-delegation-svg" aria-hidden="true">
            <defs>
              {lines.map((line, i) => (
                <marker key={i} id={`arrow-${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={line.color} opacity="0.8" />
                </marker>
              ))}
            </defs>
            {lines.map((line, i) => (
              <line
                key={i}
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke={line.color} strokeWidth="2" strokeDasharray="8 5"
                strokeLinecap="round" opacity="0.75"
                markerEnd={`url(#arrow-${i})`}
                className="delegation-dash-line"
              />
            ))}
          </svg>
        )}
      </div>

      {/* Floating drag ghost */}
      {drag && (
        <div
          className="drag-ghost"
          style={{
            left: drag.x,
            top: drag.y,
            backgroundColor: drag.agent.avatarColor,
          }}
        >
          <span className="drag-ghost-initial">{drag.agent.name.charAt(0).toUpperCase()}</span>
          <span className="drag-ghost-name">{drag.agent.name}</span>
        </div>
      )}
    </div>
  );
}
