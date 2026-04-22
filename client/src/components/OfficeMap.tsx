import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import { Room } from './Room';
import type { Agent, Room as RoomType } from '../types';

const GRID_COLS = 5;
const GRID_ROWS = 3;
const ROOMS: RoomType[] = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => ({
  id: `room-${String(i + 1).padStart(2, '0')}`,
  agentId: null,
  gridCol: (i % GRID_COLS) + 1,
  gridRow: Math.floor(i / GRID_COLS) + 1,
}));

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 1.2;

interface Props {
  onAgentClick: (agentId: string) => void;
  onEmptyRoomClick?: (roomId: string) => void;
  onEditAgent?: (agentId: string) => void;
  onDeleteAgent?: (agentId: string) => void;
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

interface PanStart {
  mouseX: number;
  mouseY: number;
  panX: number;
  panY: number;
}

export function OfficeMap({ onAgentClick, onEmptyRoomClick, onEditAgent, onDeleteAgent }: Props) {
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

  // ── Card drag state ───────────────────────────────────────────────────────

  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const [lines, setLines] = useState<DelegationLine[]>([]);

  const hoverRoomRef = useRef<string | null>(null);
  const agentByRoomRef = useRef<Map<string, Agent>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Pan/zoom state ────────────────────────────────────────────────────────

  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  // Refs so event handlers always see latest values without stale closures
  const zoomRef = useRef(1.0);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const panStartRef = useRef<PanStart | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // ── Team agents ───────────────────────────────────────────────────────────

  const teamAgents = useMemo(
    () => (currentTeamId ? agents.filter((a) => a.teamId === currentTeamId) : agents),
    [agents, currentTeamId],
  );

  const agentByRoom = useMemo(() => new Map(teamAgents.map((a) => [a.roomId, a])), [teamAgents]);
  agentByRoomRef.current = agentByRoom;

  // ── Delegation lines ──────────────────────────────────────────────────────

  const computeLines = useCallback(() => {
    if (!gridRef.current || activeDelegations.size === 0) { setLines([]); return; }
    const gridRect = gridRef.current.getBoundingClientRect();
    const z = zoomRef.current;
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
      // Divide by zoom to convert screen-space deltas to SVG (grid) coordinates
      result.push({
        x1: (fr.left - gridRect.left + fr.width / 2) / z,
        y1: (fr.top  - gridRect.top  + fr.height / 2) / z,
        x2: (tr.left - gridRect.left + tr.width / 2) / z,
        y2: (tr.top  - gridRect.top  + tr.height / 2) / z,
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

  // ── Card drag ─────────────────────────────────────────────────────────────

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

  // ── Zoom (non-passive wheel) ──────────────────────────────────────────────

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
      const ratio = newZoom / zoomRef.current;
      const newPanX = mx - (mx - panXRef.current) * ratio;
      const newPanY = my - (my - panYRef.current) * ratio;

      zoomRef.current = newZoom;
      panXRef.current = newPanX;
      panYRef.current = newPanY;
      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // ── Pan (click-drag on background) ───────────────────────────────────────

  const onBoardMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-room-id]')) return;
    if ((e.target as Element).closest('.zoom-controls')) return;
    if (dragRef.current) return;

    e.preventDefault();
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panXRef.current,
      panY: panYRef.current,
    };
    setIsPanning(true);
  }, []);

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      const start = panStartRef.current;
      if (!start) return;
      const newPanX = start.panX + (e.clientX - start.mouseX);
      const newPanY = start.panY + (e.clientY - start.mouseY);
      panXRef.current = newPanX;
      panYRef.current = newPanY;
      setPanX(newPanX);
      setPanY(newPanY);
    };

    const onUp = () => {
      panStartRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  // ── Zoom buttons ──────────────────────────────────────────────────────────

  const applyZoomButton = useCallback((factor: number) => {
    const el = mapRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
    const ratio = newZoom / zoomRef.current;
    let newPanX = panXRef.current;
    let newPanY = panYRef.current;
    if (el) {
      const mx = el.clientWidth / 2;
      const my = el.clientHeight / 2;
      newPanX = mx - (mx - panXRef.current) * ratio;
      newPanY = my - (my - panYRef.current) * ratio;
    }
    zoomRef.current = newZoom;
    panXRef.current = newPanX;
    panYRef.current = newPanY;
    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, []);

  const resetView = useCallback(() => {
    zoomRef.current = 1.0;
    panXRef.current = 0;
    panYRef.current = 0;
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const hasSvgContent = lines.length > 0;

  return (
    <div
      className={`office-map${isPanning ? ' is-panning' : ''}`}
      ref={mapRef}
      onMouseDown={onBoardMouseDown}
    >
      <div
        className="board-canvas"
        style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
      >
        <div className="office-grid" ref={gridRef}>
          {ROOMS.map((room) => {
            const agent = agentByRoom.get(room.id);
            return (
              <Room
                key={room.id}
                room={room}
                agent={agent}
                onAgentClick={onAgentClick}
                onEmptyRoomClick={!agent && onEmptyRoomClick ? () => onEmptyRoomClick(room.id) : undefined}
                isDragging={drag?.sourceRoomId === room.id}
                isDropTarget={hoverRoomId === room.id && drag?.sourceRoomId !== room.id}
                onMouseDown={(a, e) => startDrag(a, room.id, e)}
                onRenameAgent={handleRenameAgent}
                onEditAgent={onEditAgent}
                onDeleteAgent={onDeleteAgent}
              />
            );
          })}

          {hasSvgContent && (
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
      </div>

      {/* Floating drag ghost (viewport-fixed, unaffected by board transform) */}
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

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button
          className="zoom-btn"
          onClick={() => applyZoomButton(1 / ZOOM_STEP)}
          title="Zoom out"
          aria-label="Zoom out"
        >−</button>
        <button
          className="zoom-level"
          onClick={resetView}
          title="Reset view"
          aria-label="Reset zoom to 100%"
        >{Math.round(zoom * 100)}%</button>
        <button
          className="zoom-btn"
          onClick={() => applyZoomButton(ZOOM_STEP)}
          title="Zoom in"
          aria-label="Zoom in"
        >+</button>
      </div>
    </div>
  );
}
