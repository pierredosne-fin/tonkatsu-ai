import { useEffect, useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import type { Agent, CronSchedule } from '../types';

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
  const activeDelegations = useAgentStore((s) => s.activeDelegations);
  const agents = currentTeamId ? allAgents.filter((a) => a.teamId === currentTeamId) : allAgents;
  const sleepAgent = useSocketStore((s) => s.sleepAgent);

  const [schedules, setSchedules] = useState<CronSchedule[]>([]);

  useEffect(() => {
    fetch('/api/schedules')
      .then((r) => r.json())
      .then(setSchedules)
      .catch(() => {});
  }, [agents.length]);

  const agentIds = new Set(agents.map((a) => a.id));
  const teamSchedules = schedules.filter((s) => agentIds.has(s.agentId));

  const agentById = new Map(agents.map((a) => [a.id, a]));

  async function toggleSchedule(s: CronSchedule, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    }
  }

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Agents</h2>
      {agents.length === 0 ? (
        <p className="sidebar-empty">No agents yet. Create one!</p>
      ) : (
        <ul className="sidebar-list">
          {agents.map((agent) => {
            const delegatingToId = activeDelegations.get(agent.id);
            const delegatingToAgent = delegatingToId ? agentById.get(delegatingToId) : undefined;
            return (
              <li key={agent.id}>
                <div
                  className={`sidebar-item sidebar-item--${agent.status}${delegatingToAgent ? ' sidebar-item--no-border' : ''}`}
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
                </div>
                {delegatingToAgent && (
                  <div
                    className="sidebar-delegation-link"
                    onClick={() => onAgentClick(delegatingToAgent.id)}
                  >
                    <div className="sidebar-delegation-line" />
                    <span className="sidebar-delegation-target">
                      <span
                        className="sidebar-dot"
                        style={{ backgroundColor: delegatingToAgent.avatarColor, width: 7, height: 7 }}
                      />
                      {delegatingToAgent.name}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="sidebar-section">
        <h2 className="sidebar-title">Schedules</h2>
        {teamSchedules.length === 0 ? (
          <p className="sidebar-empty">No schedules.</p>
        ) : (
          <ul className="sidebar-cron-list">
            {teamSchedules.map((s) => {
              const agent = agentById.get(s.agentId);
              return (
                <li
                  key={s.id}
                  className={`sidebar-cron-item ${s.enabled ? '' : 'sidebar-cron-item--disabled'}`}
                  onClick={() => agent && onAgentClick(s.agentId)}
                  title={s.message}
                >
                  <span
                    className="sidebar-dot"
                    style={{ backgroundColor: agent?.avatarColor ?? '#888', flexShrink: 0 }}
                  />
                  <div className="sidebar-info">
                    <span className="sidebar-name">{agent?.name ?? 'Unknown'}</span>
                    <code className="sidebar-cron-expr">{s.cronExpression}</code>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm sidebar-cron-toggle"
                    onClick={(e) => toggleSchedule(s, e)}
                    title={s.enabled ? 'Disable' : 'Enable'}
                  >
                    {s.enabled ? '⏸' : '▶'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
