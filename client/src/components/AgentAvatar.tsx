import type { Agent } from '../types';

interface Props {
  agent: Agent;
  onClick: () => void;
}

const STATUS_ICON: Record<Agent['status'], string> = {
  sleeping:   '💤',
  working:    '⚙️',
  pending:    '❗',
  delegating: '📨',
};

export function AgentAvatar({ agent, onClick }: Props) {
  return (
    <div
      className={`agent-avatar agent-avatar--${agent.status}`}
      onClick={onClick}
      title={`${agent.name} — ${agent.status}`}
    >
      <div
        className="agent-circle"
        style={{ backgroundColor: agent.avatarColor }}
      >
        <span className="agent-initial">
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <span className={`agent-status-icon agent-status-icon--${agent.status}`}>
          {STATUS_ICON[agent.status]}
        </span>
      </div>
      <span className="agent-name">{agent.name}</span>
    </div>
  );
}
