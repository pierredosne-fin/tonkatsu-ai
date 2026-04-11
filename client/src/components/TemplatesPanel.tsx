import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { useSkillStore } from '../store/skillStore';
import { CreateAgentTemplateModal } from './CreateAgentTemplateModal';
import { CreateTeamTemplateModal } from './CreateTeamTemplateModal';
import type { SkillTemplate } from '../types';

interface Props {
  onClose: () => void;
}

function SkillEditor({
  skill,
  onSave,
  onClose,
}: {
  skill?: SkillTemplate;
  onSave: (params: { name: string; description: string; content: string }) => Promise<void>;
  onClose: () => void;
}) {
  const generateContent = useSkillStore((s) => s.generateContent);
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [content, setContent] = useState(skill?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!name.trim() || !description.trim()) {
      setError('Fill in name and description first');
      return;
    }
    setGenerating(true);
    setError('');
    const generated = await generateContent(name.trim(), description.trim());
    setGenerating(false);
    if (generated) {
      setContent(generated);
    } else {
      setError('Generation failed');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description: description.trim(), content: content.trim() });
    } catch {
      setError('Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="skill-editor-overlay" onClick={onClose}>
      <div className="skill-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{skill ? `Edit · ${skill.name}` : 'New Skill'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="skill-name (alphanumeric, hyphens)"
              disabled={!!skill}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this skill do?"
            />
          </div>
          <div className="form-group">
            <div className="skill-content-header">
              <label>SKILL.md</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleGenerate}
                disabled={generating || !name.trim() || !description.trim()}
              >
                {generating ? 'Generating…' : '✦ Generate'}
              </button>
            </div>
            <textarea
              className="file-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="---&#10;name: my-skill&#10;description: …&#10;---&#10;&#10;# My Skill&#10;&#10;Instructions…"
              spellCheck={false}
            />
          </div>
          {error && <div className="file-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim() || !description.trim() || !content.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplatesPanel({ onClose }: Props) {
  const agentTemplates = useTemplateStore((s) => s.agentTemplates);
  const teamTemplates = useTemplateStore((s) => s.teamTemplates);
  const deleteAgentTemplate = useTemplateStore((s) => s.deleteAgentTemplate);
  const deleteTeamTemplate = useTemplateStore((s) => s.deleteTeamTemplate);

  const skills = useSkillStore((s) => s.skills);
  const createSkill = useSkillStore((s) => s.createSkill);
  const updateSkill = useSkillStore((s) => s.updateSkill);
  const deleteSkill = useSkillStore((s) => s.deleteSkill);

  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editAgentTemplateId, setEditAgentTemplateId] = useState<string | null>(null);
  const [editTeamTemplateId, setEditTeamTemplateId] = useState<string | null>(null);
  const [spawningId, setSpawningId] = useState<string | null>(null);
  const [spawnName, setSpawnName] = useState('');
  const [spawning, setSpawning] = useState(false);

  const [showNewSkill, setShowNewSkill] = useState(false);
  const [editSkillId, setEditSkillId] = useState<string | null>(null);

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

  const handleCreateSkill = async (params: { name: string; description: string; content: string }) => {
    await createSkill(params);
    setShowNewSkill(false);
  };

  const handleUpdateSkill = async (id: string, params: { name: string; description: string; content: string }) => {
    await updateSkill(id, params);
    setEditSkillId(null);
  };

  const editingSkill = editSkillId ? skills.find((s) => s.id === editSkillId) : undefined;

  return (
    <>
      <div className="templates-panel-overlay" onClick={onClose} />
      <div className="templates-panel">
        <div className="templates-panel-header">
          <span>Templates</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="templates-panel-body">
          {/* Skill Library */}
          <div className="templates-section">
            <div className="templates-section-title">
              <span>Skill Library</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewSkill(true)}>
                + New
              </button>
            </div>
            {skills.length === 0 ? (
              <p className="templates-empty">No skills yet. Create one to reuse across agents.</p>
            ) : (
              skills.map((s) => (
                <div key={s.id} className="template-row">
                  <span className="file-icon">🛠</span>
                  <span className="template-name">{s.name}</span>
                  {s.description && (
                    <span className="templates-agent-count" title={s.description}>
                      {s.description.slice(0, 30)}{s.description.length > 30 ? '…' : ''}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditSkillId(s.id)}
                    title="Edit skill"
                  >✎</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => deleteSkill(s.id)}
                    title="Delete skill"
                  >✕</button>
                </div>
              ))
            )}
          </div>

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

      {showNewSkill && (
        <SkillEditor
          onSave={handleCreateSkill}
          onClose={() => setShowNewSkill(false)}
        />
      )}
      {editSkillId && editingSkill && (
        <SkillEditor
          skill={editingSkill}
          onSave={(params) => handleUpdateSkill(editSkillId, params)}
          onClose={() => setEditSkillId(null)}
        />
      )}
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
