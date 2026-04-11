import { useState, useEffect } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { useSkillStore } from '../store/skillStore';
import type { AgentTemplate } from '../types';

const PRESET_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

interface WorkspaceFiles {
  claudeMd: string | null;
  settings: string | null;
  commands: { name: string; content: string }[];
  rules: { name: string; content: string }[];
  skills: { name: string; content: string }[];
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  editTemplate?: AgentTemplate;
}

type Tab = 'basic' | 'claude-md' | 'commands' | 'rules' | 'skills' | 'settings';

export function CreateAgentTemplateModal({ onClose, onCreated, editTemplate }: Props) {
  const createAgentTemplate = useTemplateStore((s) => s.createAgentTemplate);
  const updateAgentTemplate = useTemplateStore((s) => s.updateAgentTemplate);
  const isEdit = !!editTemplate;

  const [tab, setTab] = useState<Tab>('basic');
  const [name, setName] = useState(editTemplate?.name ?? '');
  const [mission, setMission] = useState(editTemplate?.mission ?? '');
  const [color, setColor] = useState(editTemplate?.avatarColor ?? PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [generatingMission, setGeneratingMission] = useState(false);

  const [files, setFiles] = useState<WorkspaceFiles | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [claudeMd, setClaudeMd] = useState('');
  const [generatingClaudeMd, setGeneratingClaudeMd] = useState(false);
  const [settingsJson, setSettingsJson] = useState('');
  const [editingFile, setEditingFile] = useState<{ type: 'command' | 'rule' | 'skill'; name: string; content: string } | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [addingFromLibrary, setAddingFromLibrary] = useState<string | null>(null);
  const librarySkills = useSkillStore((s) => s.skills);

  useEffect(() => {
    if (!isEdit || !editTemplate) return;
    setFilesLoading(true);
    fetch(`/api/templates/agents/${editTemplate.id}/files`)
      .then((r) => r.json())
      .then((data: WorkspaceFiles) => {
        setFiles(data);
        setClaudeMd(data.claudeMd ?? '');
        setSettingsJson(data.settings ?? '{\n  "mcpServers": {}\n}');
      })
      .finally(() => setFilesLoading(false));
  }, [isEdit, editTemplate?.id]);

  const handleBasicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mission.trim()) return;
    setLoading(true);
    let result;
    if (isEdit) {
      result = await updateAgentTemplate(editTemplate!.id, { name: name.trim(), mission: mission.trim(), avatarColor: color });
    } else {
      result = await createAgentTemplate({ name: name.trim(), mission: mission.trim(), avatarColor: color });
    }
    setLoading(false);
    if (result) { onCreated(); onClose(); }
  };

  const baseUrl = isEdit ? `/api/templates/agents/${editTemplate!.id}` : '';

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
    if (!isEdit) return;
    setGeneratingClaudeMd(true);
    setFileError('');
    const res = await fetch(`/api/templates/agents/${editTemplate!.id}/generate-claude-md`, {
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
    setSavingFile(true); setFileError('');
    const res = await fetch(`${baseUrl}/files/claude-md`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: claudeMd }) });
    setSavingFile(false);
    if (!res.ok) setFileError('Failed to save CLAUDE.md');
  };

  const saveSettings = async () => {
    setSavingFile(true); setFileError('');
    const res = await fetch(`${baseUrl}/files/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: settingsJson }) });
    setSavingFile(false);
    if (!res.ok) { const err = await res.json(); setFileError(err.error ?? 'Failed to save'); }
  };

  const refreshFiles = async () => {
    const data: WorkspaceFiles = await fetch(`${baseUrl}/files`).then((r) => r.json());
    setFiles(data);
  };

  const saveFile = async (type: 'command' | 'rule' | 'skill', name: string, content: string) => {
    setSavingFile(true); setFileError('');
    const endpoint = type === 'command' ? 'commands' : type === 'rule' ? 'rules' : 'skills';
    const res = await fetch(`${baseUrl}/files/${endpoint}/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    setSavingFile(false);
    if (!res.ok) { setFileError('Failed to save'); return; }
    await refreshFiles();
    setEditingFile(null); setNewFileName('');
  };

  const addFromLibrary = async (skillId: string, skillName: string, skillContent: string) => {
    if (!isEdit) return;
    setAddingFromLibrary(skillId);
    await fetch(`${baseUrl}/files/skills/${encodeURIComponent(skillName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: skillContent }),
    });
    await refreshFiles();
    setAddingFromLibrary(null);
    setShowLibraryPicker(false);
  };

  const deleteFile = async (type: 'command' | 'rule' | 'skill', name: string) => {
    if (!confirm(`Delete ${type} "${name}"?`)) return;
    const endpoint = type === 'command' ? 'commands' : type === 'rule' ? 'rules' : 'skills';
    await fetch(`${baseUrl}/files/${endpoint}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await refreshFiles();
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic' },
    { id: 'claude-md', label: 'CLAUDE.md' },
    { id: 'commands', label: 'Commands' },
    { id: 'rules', label: 'Rules' },
    { id: 'skills', label: 'Skills' },
    { id: 'settings', label: 'Settings' },
  ];

  const renderFileListTab = (type: 'command' | 'rule' | 'skill', items: { name: string; content: string }[] | undefined, icon: string, placeholder: string, newPlaceholder: string, newDefault: (n: string) => string) => (
    <div className="modal-body">
      {filesLoading ? <div className="file-loading">Loading…</div> : editingFile ? (
        <>
          <div className="file-editor-header">
            <span className="file-editor-title">{type === 'skill' ? `${editingFile.name}/SKILL.md` : (type === 'command' ? `/${editingFile.name}` : editingFile.name)}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile(null)}>← Back</button>
          </div>
          <textarea className="file-editor" value={editingFile.content} onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })} spellCheck={false} autoFocus />
          {fileError && <div className="file-error">{fileError}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={savingFile} onClick={() => saveFile(type, editingFile.name, editingFile.content)}>{savingFile ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="file-list">
            {items?.length === 0 && <div className="file-empty">{placeholder}</div>}
            {items?.map((f) => (
              <div key={f.name} className="file-row">
                <span className="file-icon">{icon}</span>
                <span className="file-name">{type === 'command' ? `/${f.name}` : f.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile({ type, name: f.name, content: f.content })}>✎ Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteFile(type, f.name)}>✕</button>
              </div>
            ))}
          </div>
          <div className="file-new-row">
            <input className="file-new-input" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder={newPlaceholder} spellCheck={false} />
            <button className="btn btn-ghost btn-sm" disabled={!newFileName.trim()}
              onClick={() => { const n = newFileName.trim(); setEditingFile({ type, name: n, content: newDefault(n) }); setNewFileName(''); }}>
              + New
            </button>
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div>
        </>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${isEdit ? 'modal--wide modal--edit' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? `Edit Template · ${editTemplate!.name}` : 'New Agent Template'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {isEdit && (
          <div className="edit-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`edit-tab ${tab === t.id ? 'edit-tab--active' : ''}`}
                onClick={() => { setTab(t.id); setFileError(''); setEditingFile(null); }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'basic' && (
          <form onSubmit={handleBasicSubmit} className="modal-body">
            <div className="form-group">
              <label htmlFor="tpl-name">Name</label>
              <input id="tpl-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CEO, Data Analyst" maxLength={50} required autoFocus />
            </div>
            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="tpl-mission">Mission</label>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={generateMission} disabled={generatingMission || !name.trim()}>
                  {generatingMission ? 'Generating…' : mission.trim() ? '✦ Improve' : '✦ Generate'}
                </button>
              </div>
              <textarea id="tpl-mission" value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Describe what this agent role should do..." rows={4} maxLength={1000} required />
            </div>
            <div className="form-group">
              <label>Avatar Color</label>
              <div className="color-picker">
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button" className={`color-swatch ${color === c ? 'color-swatch--selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !name.trim() || !mission.trim()}>
                {loading ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Template')}
              </button>
            </div>
          </form>
        )}

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
                <textarea className="file-editor" value={claudeMd} onChange={(e) => setClaudeMd(e.target.value)} placeholder="# Agent Instructions&#10;&#10;Write your CLAUDE.md here…" spellCheck={false} />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                  <button type="button" className="btn btn-primary" onClick={saveClaudeMd} disabled={savingFile}>{savingFile ? 'Saving…' : 'Save CLAUDE.md'}</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'commands' && renderFileListTab('command', files?.commands, '⚡', 'No commands yet.', 'command-name', (n) => `# ${n}\n\n`)}
        {tab === 'rules' && renderFileListTab('rule', files?.rules, '📋', 'No rules yet.', 'category/rule-name', () => '')}
        {tab === 'skills' && (
          <div className="modal-body">
            {filesLoading ? <div className="file-loading">Loading…</div> : editingFile ? (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">{editingFile.name}/SKILL.md</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingFile(null)}>← Back</button>
                </div>
                <textarea className="file-editor" value={editingFile.content} onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })} spellCheck={false} autoFocus />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingFile} onClick={() => saveFile('skill', editingFile.name, editingFile.content)}>{savingFile ? 'Saving…' : 'Save'}</button>
                </div>
              </>
            ) : (
              <>
                {showLibraryPicker && librarySkills.length > 0 && (
                  <div className="skill-library-picker">
                    <div className="skill-library-picker-header">
                      <span>Pick from library</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowLibraryPicker(false)}>✕</button>
                    </div>
                    {librarySkills
                      .filter((ls) => !files?.skills.some((s) => s.name === ls.name))
                      .map((ls) => (
                        <div key={ls.id} className="file-row">
                          <span className="file-icon">🛠</span>
                          <span className="file-name">{ls.name}</span>
                          {ls.description && <span className="templates-agent-count">{ls.description.slice(0, 40)}</span>}
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={addingFromLibrary === ls.id}
                            onClick={() => addFromLibrary(ls.id, ls.name, ls.content)}
                          >
                            {addingFromLibrary === ls.id ? '…' : '+ Add'}
                          </button>
                        </div>
                      ))}
                    {librarySkills.filter((ls) => !files?.skills.some((s) => s.name === ls.name)).length === 0 && (
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
                  <input className="file-new-input" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="skill-name" spellCheck={false} />
                  <button className="btn btn-ghost btn-sm" disabled={!newFileName.trim()}
                    onClick={() => { const n = newFileName.trim(); setEditingFile({ type: 'skill', name: n, content: `---\nname: ${n}\ndescription: \n---\n\n# ${n}\n\n` }); setNewFileName(''); }}>
                    + New
                  </button>
                  {librarySkills.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowLibraryPicker((v) => !v)}>
                      From Library
                    </button>
                  )}
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div>
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="modal-body modal-body--file">
            {filesLoading ? <div className="file-loading">Loading…</div> : (
              <>
                <div className="file-editor-header">
                  <span className="file-editor-title">.claude/settings.json</span>
                  <span className="form-hint">MCP servers, permissions, hooks</span>
                </div>
                <textarea className="file-editor file-editor--json" value={settingsJson} onChange={(e) => setSettingsJson(e.target.value)} spellCheck={false} />
                {fileError && <div className="file-error">{fileError}</div>}
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
                  <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={savingFile}>{savingFile ? 'Saving…' : 'Save settings.json'}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
