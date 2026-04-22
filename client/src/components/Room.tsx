import { useState, useRef, useEffect } from 'react';
import type { Room as RoomType, Agent } from '../types';
import { AgentAvatar } from './AgentAvatar';

interface Props {
  room: RoomType;
  agent?: Agent;
  onAgentClick: (agentId: string) => void;
  onEmptyRoomClick?: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onMouseDown: (agent: Agent, e: React.MouseEvent) => void;
  onRenameAgent?: (agentId: string, name: string) => void;
  onEditAgent?: (agentId: string) => void;
  onDeleteAgent?: (agentId: string) => void;
}

export function Room({
  room,
  agent,
  onAgentClick,
  onEmptyRoomClick,
  isDragging,
  isDropTarget,
  onMouseDown,
  onRenameAgent,
  onEditAgent,
  onDeleteAgent,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (agent) openTimer.current = setTimeout(() => onAgentClick(agent.id), 2000);
  };

  const handleMouseLeave = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
  };

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startRename = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditing(true);
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== agent?.name && agent) {
      onRenameAgent?.(agent.id, trimmed);
    }
    setEditing(false);
  };

  const cancelRename = () => setEditing(false);

  const classNames = [
    'room',
    agent ? `room--occupied room--${agent.status}` : 'room--vacant',
    isDragging ? 'room--dragging' : '',
    isDropTarget ? 'room--drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      data-room-id={room.id}
      style={{ gridColumn: room.gridCol, gridRow: room.gridRow, cursor: !agent && onEmptyRoomClick ? 'pointer' : undefined }}
      onClick={!agent && onEmptyRoomClick ? onEmptyRoomClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="room-label">
        {agent ? (
          editing ? (
            <input
              ref={inputRef}
              className="room-label-rename-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') cancelRename();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
              title="Double-click to rename"
            >
              {agent.name}
            </span>
          )
        ) : (
          `Office ${room.id.replace('room-', '')}`
        )}
      </div>
      <div className="room-content">
        {agent ? (
          <div
            className="room-draggable"
            onMouseDown={(e) => onMouseDown(agent, e)}
          >
            <AgentAvatar agent={agent} onClick={() => onAgentClick(agent.id)} />
          </div>
        ) : (
          <span className="room-vacant-text">
            {onEmptyRoomClick ? '+' : ''}
          </span>
        )}
      </div>
      {agent && (onEditAgent || onDeleteAgent) && (
        <div className="room-actions">
          {onEditAgent && (
            <button
              className="room-action-btn"
              title="Edit agent"
              onClick={(e) => { e.stopPropagation(); onEditAgent(agent.id); }}
            >✎</button>
          )}
          {onDeleteAgent && (
            <button
              className="room-action-btn room-action-btn--danger"
              title="Delete agent"
              onClick={(e) => { e.stopPropagation(); onDeleteAgent(agent.id); }}
            >✕</button>
          )}
        </div>
      )}
      {agent?.status === 'pending' && (
        <div className="room-pending-badge">Needs input</div>
      )}
      {agent?.status === 'delegating' && (
        <div className="room-delegating-badge">Waiting for agent</div>
      )}
    </div>
  );
}
