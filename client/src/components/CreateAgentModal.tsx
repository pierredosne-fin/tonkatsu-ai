import { useState, useEffect } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { useSkillStore } from '../store/skillStore';

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
];

interface EditAgent {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  workspacePath: string;
  canCreateAgents?: boolean;
}

interface WorkspaceFiles {
  claudeMd: string | null;
  settings: string | null;
  commands: { name: string; content: string }[];
  rules: { name: string; content: string }[];
  skills: { name: string; content: string }[];
}

interface Props {
  onClose: () => void;
  onCreate: (name: string, mission: string, avatarColor: string, workspacePath?: string, teamId?: string, agentTemplateId?: string, canCreateAgents?: boolean) => void;
  onEdit?: (agentId: string, name: string, mission: string, avatarColor: string, canCreateAgents: boolean) => void;
  initialName?: string;
  initialWorkspacePath?: string;
  teamId?: string;
  editAgent?: EditAgent;
}

type Tab = 'basic' | 'claude-md' | 'commands' | 'rules' | 'skills' | 'settings';

export function CreateAgentModal({ onClose, onCreate, onEdit, initialName, initialWorkspacePath, teamId, editAgent }: Props) {
  const agentTemplates = useTemplateStore((s) => s.agentTemplates);
  const librarySkills = useSkillStore((s) => s.skills);
  const addSkillToAgent = useSkillStore((s) => s.addToAgent);
  const isEdit = !!editAgent;

  // Basic tab state
  const [name, setName] = useState(editAgent?.name ?? initialName ?? '');
  const [mission, setMission] = useState(editAgent?.mission ?? '');
  const [color, setColor] = useState(editAgent?.avatarColor ?? PRESET_COLORS[0]);
  const [canCreateAgents, setCanCreateAgents] = useState(editAgent?.canCreateAgents ?? false);
  const [workspacePath, setWorkspacePath] = useState(initialWorkspacePath ?? '');
  const [loading, setLoading] = useState(false);
  const [generatingMission, setGeneratingMission] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);

  // Tab state (edit mode only)
  const [tab, setTab] = useState<Tab>('basic');

  // Workspace files state
  const [files, setFiles] = useState<WorkspaceFiles | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  // Per-file editing state
  const [claudeMd, setClaudeMd] = useState('');
  const [generatingClaudeMd, setGeneratingClaudeMd] = useState(false);
  const [settingsJson, setSettingsJson] = useState('');
  const [editingFile, setEditingFile] = useState<{ type: 'command' | 'rule' | 'skill'; name: string; content: string } | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [addingFromLibrary, setAddingFromLibrary] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !editAgent) return;
    setFilesLoading(true);
    fetch(`/api/agents/${editAgent.id}/files`)
      .then((r) => r.json())
      .then((data: WorkspaceFiles) => {
        setFiles(data);
        setClaudeMd(data.claudeMd ?? '');
        setSettingsJson(data.settings ?? '{\n  "mcpServers": {}\n}');
      })
      .finally(() => setFilesLoading(false));
  }, [isEdit, editAgent?.id]);

  const handleBasicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mission.trim()) return;
    setLoading(true);
    if (isEdit && onEdit) {
      await onEdit(editAgent!.id, name.trim(), mission.trim(), color, canCreateAgents);
    } else {
      await onCreate(name.trim(), mission.trim(), color, workspacePath.trim() || undefined, teamId, selectedTemplateId, canCreateAgents);
    }
    setLoading(false);
  };

  const generateMission = async () => {
    if (!name.trim()) return;
    setGeneratingMission(true);
    const res = await fetch('/api/agents/generate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), current: mission }),
    });
    setGeneratingMission(false);
    if (res.ok) {
      const { mission: generated } = await res.json();
      setMission(generated);
    }
  };

  const generateClaudeMd = async () => {
    setGeneratingClaudeMd(true);
    setFileError('');
    const res = await fetch(`/api/agents/${editAgent!.id}/generate-claude-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: claudeMd }),
    });
    setGeneratingClaudeMd(false);
    if (res.ok) {
      const { content } = await res.json();
      setClaudeMd(content);
    } else {
      setFileError('Generation failed');
    }
  };

  const saveClaudeMd = async () => {
    setSavingFile(true);
    setFileError('');
    const res = await fetch(`/api/agents/${editAgent!.id}/files/claude-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: claudeMd }),
    });
    setSavingFile(false);
    if (!res.ok) setFileError('Failed to save CLAUDE.md');
  };

  const saveSettings = async () => {
    setSavingFile(true);
    setFileError('');
    const res = await fetch(`/api/agents/${editAgent!.id}/files/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: settingsJson }),
    });
    setSavingFile(false);
    if (!res.ok) {
      const err = await res.json();
      setFileError(err.error ?? 'Failed to save settings');
    }
  };

  const saveFile = async (type: 'command' | 'rule' | 'skill', name: string, content: string) => {
    setSavingFile(true);
    setFileError('');
    const endpoint = type === 'command' ? 'commands' : type === 'rule' ? 'rules' : 'skills';
    const res = await fetch(`/api/agents/${editAgent!.id}/files/${endpoint}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setSavingFile(false);
    if (!res.ok) { setFileError('Failed to save'); return; }
    const updated: WorkspaceFiles = await fetch(`/api/agents/${editAgent!.id}/files`).then((r) => r.json());
    setFiles(updated);
    setEditingFile(null);
    setNewFileName('');
  };

  const addFromLibrary = async (skillId: string) => {
    if (!editAgent) return;
    setAddingFromLibrary(skillId);
    await addSkillToAgent(skillId, editAgent.id);
    const updated: WorkspaceFiles = await fetch(`/api/agents/${editAgent.id}/files`).then((r) => r.json());
    setFiles(updated);
    setAddingFromLibrary(null);
    setShowLibraryPicker(false);
  };

  const deleteFile = async (type: 'command' | 'rule' | 'skill', name: string) => {
    if (!confirm(`Delete ${type} "${name}"?`)) return;
    const endpoint = type === 'command' ? 'commands' : type === 'rule' ? 'rules' : 'skills';
    await fetch(`/api/agents/${editAgent!.id}/files/${endpoint}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const updated: WorkspaceFiles = await fetch(`/api/agents/${editAgent!.id}/files`).then((r) => r.json());
    setFiles(updated);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic' },
    { id: 'claude-md', label: 'CLAUDE.md' },
    { id: 'commands', label: 'Commands' },
    { id: 'rules', label: 'Rules' },
    { id: 'skills', label: 'Skills' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${isEdit ? 'modal--wide modal--edit' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? `Edit · ${editAgent!.name}` : 'Create Agent'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {isEdit && (
          <div className="edit-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`edit-tab ${tab === t.id ? 'edit-tab--active' : ''}`}
                onClick={() => { setTab(t.id); setFileError(''); setEditingFile(null); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Basic Tab ── */}
        {tab === 'basic' && (
          <form onSubmit={handleBasicSubmit} className="modal-body">
            {!isEdit && agentTemplates.length > 0 && (
              <div className="template-pills-section">
                <span className="template-pills-label">From template:</span>
                <div className="template-pills">
                  {agentTemplates.map((t) => (
                    <button key={t.id} type="button"
                      className={`template-pill ${selectedTemplateId === t.id ? 'template-pill--selected' : ''}`}
                      onClick={() => { setName(t.name); setMission(t.mission); setColor(t.avatarColor); setSelectedTemplateId(t.id); }}
                    >
                      <span className="template-dot" style={{ backgroundColor: t.avatarColor }} />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="agent-name">Name</label>
              <input id="agent-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex" maxLength={50} required autoFocus />
            </div>
            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="agent-mission">Mission</label>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={generateMission} disabled={generatingMission || !name.trim()}>
                  {generatingMission ? 'Generating…' : mission.trim() ? '✦ Improve' : '✦ Generate'}
                </button>
              </div>
              <textarea id="agent-mission" value={mission} onChange={(e) => setMission(e.target.value)}
                placeholder="Describe what this agent should do..." rows={4} maxLength={1000} required />
            </div>
            {!isEdit && (
              <div className="form-group">
                <label htmlFor="agent-workspace">
                  Workspace Path
                  <span className="form-hint"> — optional, absolute path</span>
                </label>
                <input id="agent-workspace" type="text" value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="Leave empty to auto-create workspace" spellCheck={false} />
                {workspacePath.trim() && (
                  <span className="form-hint-block">
                    Agent will work in this directory. If it's a git repo, a dedicated worktree (branch <code>agent/…</code>) will be created automatically.
                  </span>
                )}
              </div>
            )}
            <div className="form-group">
              <label>Avatar Color</label>
              <div className="color-picker">
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button"
                    className={`color-swatch ${color === c ? 'color-swatch--selected' : ''}`}
                    style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            {isEdit && (
              <div className="form-hint-block" style={{ marginBottom: 8 }}>
                📂 <code>{editAgent!.workspacePath}</code>
              </div>
            )}
            <div className="form-group form-group--toggle">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={canCreateAgents}
                  onChange={(e) => setCanCreateAgents(e.target.checked)}
                />
                <span>Can create agents</span>
              </label>
              <span className="form-hint">Allows this agent to spawn new agents via the API</span>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !name.trim() || !mission.trim()}>
                {loading ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create & Start')}
              </button>
            </div>
          </form>
        )}

        {/* ── CLAUDE.md Tab ── */}
        {tab === 'claude-md' && (
          <div className="modal-body modal-body--file">
            {filesLoading ? <div className="file-loading">Loading…</div> : (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">CLAUDE.md</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={generateClaudeMd}
                    disabled={generatingClaudeMd}
                  >
                    {generatingClaudeMd ? 'Generating…' : claudeMd.trim() ? '✦ Improve' : '✦ Generate'}
                  </button>
                </div>
                <textarea
                  className="file-editor"
                  value={claudeMd}
                  onChange={(e) => setClaudeMd(e.target.value)}
                  placeholder="# Agent Instructions&#10;&#10;Write your CLAUDE.md here…"
                  spellCheck={false}
                />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                  <button type="button" className="btn btn-primary" onClick={saveClaudeMd} disabled={savingFile}>
                    {savingFile ? 'Saving…' : 'Save CLAUDE.md'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Commands Tab ── */}
        {tab === 'commands' && (
          <div className="modal-body">
            {filesLoading ? <div className="file-loading">Loading…</div> : editingFile ? (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">/{editingFile.name}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile(null)}>← Back</button>
                </div>
                <textarea
                  className="file-editor"
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  spellCheck={false}
                  autoFocus
                />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingFile}
                    onClick={() => saveFile('command', editingFile.name, editingFile.content)}>
                    {savingFile ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="file-list">
                  {files?.commands.length === 0 && <div className="file-empty">No commands yet.</div>}
                  {files?.commands.map((f) => (
                    <div key={f.name} className="file-row">
                      <span className="file-icon">⚡</span>
                      <span className="file-name">/{f.name}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile({ type: 'command', name: f.name, content: f.content })}>✎ Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteFile('command', f.name)}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="file-new-row">
                  <input
                    className="file-new-input"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="command-name"
                    spellCheck={false}
                  />
                  <button className="btn btn-ghost btn-sm" disabled={!newFileName.trim()}
                    onClick={() => { setEditingFile({ type: 'command', name: newFileName.trim(), content: `# ${newFileName.trim()}\n\n` }); setNewFileName(''); }}>
                    + New
                  </button>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Rules Tab ── */}
        {tab === 'rules' && (
          <div className="modal-body">
            {filesLoading ? <div className="file-loading">Loading…</div> : editingFile ? (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">{editingFile.name}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile(null)}>← Back</button>
                </div>
                <textarea
                  className="file-editor"
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  spellCheck={false}
                  autoFocus
                />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingFile}
                    onClick={() => saveFile('rule', editingFile.name, editingFile.content)}>
                    {savingFile ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="file-list">
                  {files?.rules.length === 0 && <div className="file-empty">No rules yet.</div>}
                  {files?.rules.map((f) => (
                    <div key={f.name} className="file-row">
                      <span className="file-icon">📋</span>
                      <span className="file-name">{f.name}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile({ type: 'rule', name: f.name, content: f.content })}>✎ Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteFile('rule', f.name)}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="file-new-row">
                  <input
                    className="file-new-input"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="category/rule-name"
                    spellCheck={false}
                  />
                  <button className="btn btn-ghost btn-sm" disabled={!newFileName.trim()}
                    onClick={() => { setEditingFile({ type: 'rule', name: newFileName.trim(), content: '' }); setNewFileName(''); }}>
                    + New
                  </button>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Skills Tab ── */}
        {tab === 'skills' && (
          <div className="modal-body">
            {filesLoading ? <div className="file-loading">Loading…</div> : editingFile ? (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">{editingFile.name}/SKILL.md</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile(null)}>← Back</button>
                </div>
                <textarea
                  className="file-editor"
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  spellCheck={false}
                  autoFocus
                />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingFile}
                    onClick={() => saveFile('skill', editingFile.name, editingFile.content)}>
                    {savingFile ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Library picker */}
                {showLibraryPicker && librarySkills.length > 0 && (
                  <div className="skill-library-picker">
                    <div className="skill-library-picker-header">
                      <span>Pick from library</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowLibraryPicker(false)}>✕</button>
                    </div>
                    {librarySkills
                      .filter((ls) => !files?.skills.some((as) => as.name === ls.name))
                      .map((ls) => (
                        <div key={ls.id} className="file-row">
                          <span className="file-icon">🛠</span>
                          <span className="file-name">{ls.name}</span>
                          {ls.description && <span className="templates-agent-count">{ls.description.slice(0, 40)}</span>}
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={addingFromLibrary === ls.id}
                            onClick={() => addFromLibrary(ls.id)}
                          >
                            {addingFromLibrary === ls.id ? '…' : '+ Add'}
                          </button>
                        </div>
                      ))}
                    {librarySkills.filter((ls) => !files?.skills.some((as) => as.name === ls.name)).length === 0 && (
                      <div className="file-empty">All library skills already added.</div>
                    )}
                  </div>
                )}
                <div className="file-list">
                  {files?.skills.length === 0 && <div className="file-empty">No skills yet.</div>}
                  {files?.skills.map((f) => (
                    <div key={f.name} className="file-row">
                      <span className="file-icon">🛠</span>
                      <span className="file-name">{f.name}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile({ type: 'skill', name: f.name, content: f.content })}>✎ Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteFile('skill', f.name)}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="file-new-row">
                  <input
                    className="file-new-input"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="skill-name"
                    spellCheck={false}
                  />
                  <button className="btn btn-ghost btn-sm" disabled={!newFileName.trim()}
                    onClick={() => {
                      const n = newFileName.trim();
                      setEditingFile({ type: 'skill', name: n, content: `---\nname: ${n}\ndescription: \n---\n\n# ${n}\n\n` });
                      setNewFileName('');
                    }}>
                    + New
                  </button>
                  {librarySkills.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowLibraryPicker((v) => !v)}
                    >
                      From Library
                    </button>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <div className="modal-body modal-body--file">
            {filesLoading ? <div className="file-loading">Loading…</div> : (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">.claude/settings.json</span>
                  <span className="form-hint">MCP servers, permissions, hooks</span>
                </div>
                <textarea
                  className="file-editor file-editor--json"
                  value={settingsJson}
                  onChange={(e) => setSettingsJson(e.target.value)}
                  spellCheck={false}
                />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                  <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={savingFile}>
                    {savingFile ? 'Saving…' : 'Save settings.json'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
