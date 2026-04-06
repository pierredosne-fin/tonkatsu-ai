import { useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';

interface Props {
  onCreateTeam: (teamId: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onOpenTemplates?: () => void;
}

export function TeamTabs({ onCreateTeam, onDeleteTeam, onOpenTemplates }: Props) {
  const teams = useAgentStore((s) => s.teams);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const setCurrentTeam = useAgentStore((s) => s.setCurrentTeam);
  const agents = useAgentStore((s) => s.agents);
  const { newTeamConversation } = useSocketStore();

  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const handleCreate = () => {
    const id = newTeamName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) return;
    setCreating(false);
    setNewTeamName('');
    onCreateTeam(id);
  };

  const agentCountByTeam = (teamId: string) =>
    agents.filter((a) => a.teamId === teamId).length;

  function handleNewTeamConversation(e: React.MouseEvent, teamId: string) {
    e.stopPropagation();
    if (!confirm('Start a new conversation for all agents in this team?')) return;
    newTeamConversation(teamId);
  }

  return (
    <div className="team-tabs">
      {teams.map((team) => (
        <div
          key={team.id}
          className={`team-tab ${team.id === currentTeamId ? 'team-tab--active' : ''}`}
          onClick={() => setCurrentTeam(team.id)}
        >
          {team.name}
          <span className="team-tab-count">{agentCountByTeam(team.id)}</span>
          {team.id === currentTeamId && (
            <span
              className="team-tab-new"
              data-tooltip="Archive & reset all agents' conversations in this team"
              onClick={(e) => handleNewTeamConversation(e, team.id)}
            >↺ New</span>
          )}
          <span
            className="team-tab-delete"
            title={`Delete ${team.name}`}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete team "${team.name}" and all its agents?`)) {
                onDeleteTeam(team.id);
              }
            }}
          >✕</span>
        </div>
      ))}

      {creating ? (
        <div className="team-tab-new-input">
          <input
            autoFocus
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewTeamName(''); }
            }}
            placeholder="Team name…"
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreate}>Add</button>
          {onOpenTemplates && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setCreating(false); setNewTeamName(''); onOpenTemplates(); }}
              title="Create from template"
            >
              or from template →
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { setCreating(false); setNewTeamName(''); }}>✕</button>
        </div>
      ) : (
        <button className="team-tab team-tab--add" onClick={() => setCreating(true)}>
          + New Team
        </button>
      )}
    </div>
  );
}
