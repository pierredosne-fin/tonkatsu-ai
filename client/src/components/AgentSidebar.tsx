import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import type { Agent } from '../types';

const STATUS_LABEL: Record<Agent['status'], string> = {
  sleeping:   'Sleeping',
  working:    'Working',
  pending:    'Needs input',
  delegating: 'Waiting for agent',
};

interface Props {
  onAgentClick: (agentId: string) => void;
}

export function AgentSidebar({ onAgentClick }: Props) {
  const allAgents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const agents = currentTeamId ? allAgents.filter((a) => a.teamId === currentTeamId) : allAgents;
  const sleepAgent = useSocketStore((s) => s.sleepAgent);

  if (agents.length === 0) {
    return (
      <aside className="sidebar">
        <h2 className="sidebar-title">Agents</h2>
        <p className="sidebar-empty">No agents yet. Create one!</p>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Agents</h2>
      <ul className="sidebar-list">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className={`sidebar-item sidebar-item--${agent.status}`}
            onClick={() => onAgentClick(agent.id)}
          >
            <span
              className="sidebar-dot"
              style={{ backgroundColor: agent.avatarColor }}
            />
            <div className="sidebar-info">
              <span className="sidebar-name">{agent.name}</span>
              <span className={`sidebar-status sidebar-status--${agent.status}`}>
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
            {agent.status === 'working' && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  sleepAgent(agent.id);
                }}
                title="Stop agent"
              >
                ■
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
