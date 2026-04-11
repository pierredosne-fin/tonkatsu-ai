import { useState, useRef, useEffect } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import { useTemplateStore } from '../store/templateStore';

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

  const fetchAllTemplates = useTemplateStore((s) => s.fetchAll);

  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Tab ordering ──────────────────────────────────────────────────────────
  const STORAGE_KEY = 'team-tab-order';
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
  });

  // Keep order up to date as teams are added/removed
  useEffect(() => {
    const ids = teams.map((t) => t.id);
    setTabOrder((prev) => {
      const merged = [...prev.filter((id) => ids.includes(id)), ...ids.filter((id) => !prev.includes(id))];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, [teams.map((t) => t.id).join(',')]);

  const sortedTeams = [...teams].sort((a, b) => {
    const ai = tabOrder.indexOf(a.id);
    const bi = tabOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ── Drag state ────────────────────────────────────────────────────────────
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function onDragStart(id: string) { dragId.current = id; }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragId.current !== id) setDragOverId(id);
  }

  function onDrop(targetId: string) {
    const src = dragId.current;
    if (!src || src === targetId) { cleanup(); return; }
    setTabOrder((prev) => {
      const next = [...prev];
      const si = next.indexOf(src);
      const ti = next.indexOf(targetId);
      if (si === -1 || ti === -1) return prev;
      next.splice(si, 1);
      next.splice(ti, 0, src);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    cleanup();
  }

  function cleanup() { dragId.current = null; setDragOverId(null); }

  const handleCreate = () => {
    const id = newTeamName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) return;
    setCreating(false);
    setNewTeamName('');
    onCreateTeam(id);
  };

  const agentCountByTeam = (teamId: string) =>
    agents.filter((a) => a.teamId === teamId).length;

  function startRename(team: { id: string; name: string }) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
    setTimeout(() => { editInputRef.current?.select(); }, 0);
  }

  async function commitRename() {
    if (!editingTeamId || !editingName.trim()) { cancelRename(); return; }
    await fetch(`/api/teams/${editingTeamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName.trim() }),
    });
    setEditingTeamId(null);
  }

  function cancelRename() {
    setEditingTeamId(null);
    setEditingName('');
  }

  async function handleSaveAsTemplate(e: React.MouseEvent, teamId: string) {
    e.stopPropagation();
    const res = await fetch(`/api/teams/${teamId}/save-as-template`, { method: 'POST' });
    if (res.ok) {
      await fetchAllTemplates();
      setSavedTeamId(teamId);
      setTimeout(() => setSavedTeamId(null), 2000);
    }
  }

  function handleNewTeamConversation(e: React.MouseEvent, teamId: string) {
    e.stopPropagation();
    if (!confirm('Start a new conversation for all agents in this team?')) return;
    newTeamConversation(teamId);
  }

  return (
    <div className="team-tabs">
      {sortedTeams.map((team) => (
        <div
          key={team.id}
          className={`team-tab ${team.id === currentTeamId ? 'team-tab--active' : ''} ${dragOverId === team.id ? 'team-tab--drag-over' : ''}`}
          draggable
          onDragStart={() => onDragStart(team.id)}
          onDragOver={(e) => onDragOver(e, team.id)}
          onDrop={() => onDrop(team.id)}
          onDragEnd={cleanup}
          onClick={() => { if (editingTeamId !== team.id) setCurrentTeam(team.id); }}
          onDoubleClick={() => startRename(team)}
        >
          {editingTeamId === team.id ? (
            <input
              ref={editInputRef}
              className="team-tab-rename-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
                e.stopPropagation();
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            team.name
          )}
          <span className="team-tab-count">{agentCountByTeam(team.id)}</span>
          {team.id === currentTeamId && (
            <>
              <span
                className="team-tab-new"
                title="Save this team as a template"
                onClick={(e) => handleSaveAsTemplate(e, team.id)}
              >
                {savedTeamId === team.id ? '✓' : '⊞'}
              </span>
              <span
                className="team-tab-new"
                data-tooltip="Archive & reset all agents' conversations in this team"
                onClick={(e) => handleNewTeamConversation(e, team.id)}
              >↺ New</span>
            </>
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
