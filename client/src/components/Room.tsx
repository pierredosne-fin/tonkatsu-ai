import type { Room as RoomType, Agent } from '../types';
import { AgentAvatar } from './AgentAvatar';

interface Props {
  room: RoomType;
  agent?: Agent;
  onAgentClick: (agentId: string) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

export function Room({
  room,
  agent,
  onAgentClick,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: Props) {
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
      style={{ gridColumn: room.gridCol, gridRow: room.gridRow }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <div className="room-label">
        {agent ? agent.name : `Office ${room.id.replace('room-', '')}`}
      </div>
      <div className="room-content">
        {agent ? (
          <div
            draggable
            className="room-draggable"
            onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
            onDragEnd={onDragEnd}
          >
            <AgentAvatar agent={agent} onClick={() => onAgentClick(agent.id)} />
          </div>
        ) : (
          <span className="room-vacant-text">Vacant</span>
        )}
      </div>
      {agent?.status === 'pending' && (
        <div className="room-pending-badge">Needs input</div>
      )}
      {agent?.status === 'delegating' && (
        <div className="room-delegating-badge">Waiting for agent</div>
      )}
    </div>
  );
}
