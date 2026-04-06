import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { CreateAgentTemplateModal } from './CreateAgentTemplateModal';
import { CreateTeamTemplateModal } from './CreateTeamTemplateModal';

interface Props {
  onClose: () => void;
}

export function TemplatesPanel({ onClose }: Props) {
  const agentTemplates = useTemplateStore((s) => s.agentTemplates);
  const teamTemplates = useTemplateStore((s) => s.teamTemplates);
  const deleteAgentTemplate = useTemplateStore((s) => s.deleteAgentTemplate);
  const deleteTeamTemplate = useTemplateStore((s) => s.deleteTeamTemplate);

  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editAgentTemplateId, setEditAgentTemplateId] = useState<string | null>(null);
  const [editTeamTemplateId, setEditTeamTemplateId] = useState<string | null>(null);
  const [spawningId, setSpawningId] = useState<string | null>(null);
  const [spawnName, setSpawnName] = useState('');
  const [spawning, setSpawning] = useState(false);

  const handleSpawnStart = (templateId: string, templateName: string) => {
    setSpawningId(templateId);
    setSpawnName(templateName.toLowerCase().replace(/\s+/g, '-'));
  };

  const handleSpawnConfirm = async (templateId: string) => {
    if (!spawnName.trim()) return;
    setSpawning(true);
    await fetch(`/api/templates/teams/${templateId}/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: spawnName.trim() }),
    });
    setSpawning(false);
    setSpawningId(null);
    setSpawnName('');
  };

  return (
    <>
      <div className="templates-panel-overlay" onClick={onClose} />
      <div className="templates-panel">
        <div className="templates-panel-header">
          <span>Templates</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="templates-panel-body">
          {/* Agent Templates */}
          <div className="templates-section">
            <div className="templates-section-title">
              <span>Agent Templates</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateAgent(true)}>
                + New
              </button>
            </div>
            {agentTemplates.length === 0 ? (
              <p className="templates-empty">No agent templates yet.</p>
            ) : (
              agentTemplates.map((t) => (
                <div key={t.id} className="template-row">
                  <span className="template-dot" style={{ backgroundColor: t.avatarColor }} />
                  <span className="template-name">{t.name}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditAgentTemplateId(t.id)}
                    title="Edit template"
                  >✎</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => deleteAgentTemplate(t.id)}
                    title="Delete template"
                  >✕</button>
                </div>
              ))
            )}
          </div>

          {/* Team Templates */}
          <div className="templates-section">
            <div className="templates-section-title">
              <span>Team Templates</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateTeam(true)}>
                + New
              </button>
            </div>
            {teamTemplates.length === 0 ? (
              <p className="templates-empty">No team templates yet.</p>
            ) : (
              teamTemplates.map((t) => (
                <div key={t.id}>
                  <div className="template-row">
                    <span className="template-name">{t.name}</span>
                    <span className="templates-agent-count">
                      {t.agentTemplateIds.length} agent{t.agentTemplateIds.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditTeamTemplateId(t.id)}
                      title="Edit template"
                    >✎</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleSpawnStart(t.id, t.name)}
                      title="Spawn this team"
                    >
                      Spawn ▶
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteTeamTemplate(t.id)}
                      title="Delete template"
                    >✕</button>
                  </div>
                  {spawningId === t.id && (
                    <div className="template-spawn-input">
                      <input
                        autoFocus
                        value={spawnName}
                        onChange={(e) => setSpawnName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSpawnConfirm(t.id);
                          if (e.key === 'Escape') { setSpawningId(null); setSpawnName(''); }
                        }}
                        placeholder="Team name (slug)…"
                        className="template-spawn-input-field"
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSpawnConfirm(t.id)}
                        disabled={spawning || !spawnName.trim()}
                      >
                        {spawning ? '…' : 'Create'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setSpawningId(null); setSpawnName(''); }}
                      >✕</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateAgent && (
        <CreateAgentTemplateModal
          onClose={() => setShowCreateAgent(false)}
          onCreated={() => {}}
        />
      )}
      {editAgentTemplateId && (() => {
        const t = agentTemplates.find((x) => x.id === editAgentTemplateId);
        return t ? (
          <CreateAgentTemplateModal
            onClose={() => setEditAgentTemplateId(null)}
            onCreated={() => {}}
            editTemplate={t}
          />
        ) : null;
      })()}
      {showCreateTeam && (
        <CreateTeamTemplateModal
          onClose={() => setShowCreateTeam(false)}
          onCreated={() => {}}
        />
      )}
      {editTeamTemplateId && (() => {
        const t = teamTemplates.find((x) => x.id === editTeamTemplateId);
        return t ? (
          <CreateTeamTemplateModal
            onClose={() => setEditTeamTemplateId(null)}
            onCreated={() => {}}
            editTemplate={t}
          />
        ) : null;
      })()}
    </>
  );
}
