import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
];

interface Props {
  onClose: () => void;
  onCreate: (name: string, mission: string, avatarColor: string, workspacePath?: string, teamId?: string) => void;
  initialName?: string;
  initialWorkspacePath?: string;
  teamId?: string;
}

export function CreateAgentModal({ onClose, onCreate, initialName, initialWorkspacePath, teamId }: Props) {
  const agentTemplates = useTemplateStore((s) => s.agentTemplates);
  const [name, setName] = useState(initialName ?? '');
  const [mission, setMission] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [workspacePath, setWorkspacePath] = useState(initialWorkspacePath ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mission.trim()) return;
    setLoading(true);
    await onCreate(name.trim(), mission.trim(), color, workspacePath.trim() || undefined, teamId);
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Agent</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {agentTemplates.length > 0 && (
            <div className="template-pills-section">
              <span className="template-pills-label">From template:</span>
              <div className="template-pills">
                {agentTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="template-pill"
                    onClick={() => { setName(t.name); setMission(t.mission); setColor(t.avatarColor); }}
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
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={50}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-mission">Mission</label>
            <textarea
              id="agent-mission"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="Describe what this agent should do..."
              rows={4}
              maxLength={1000}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-workspace">
              Workspace Path
              <span className="form-hint"> — optional, absolute path (e.g. /Users/you/my-project)</span>
            </label>
            <input
              id="agent-workspace"
              type="text"
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder="Leave empty to auto-create workspace"
              spellCheck={false}
            />
            {workspacePath.trim() && (
              <span className="form-hint-block">
                Agent will work in this directory. If it's a git repo, a dedicated worktree (branch <code>agent/…</code>) will be created automatically.
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Avatar Color</label>
            <div className="color-picker">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color === c ? 'color-swatch--selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !name.trim() || !mission.trim()}
            >
              {loading ? 'Creating…' : 'Create & Start'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
