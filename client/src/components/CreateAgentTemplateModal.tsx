import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';

const PRESET_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateAgentTemplateModal({ onClose, onCreated }: Props) {
  const createAgentTemplate = useTemplateStore((s) => s.createAgentTemplate);
  const [name, setName] = useState('');
  const [mission, setMission] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mission.trim()) return;
    setLoading(true);
    const result = await createAgentTemplate({ name: name.trim(), mission: mission.trim(), avatarColor: color });
    setLoading(false);
    if (result) {
      onCreated();
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Agent Template</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="tpl-name">Name</label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CEO, Data Analyst"
              maxLength={50}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="tpl-mission">Mission</label>
            <textarea
              id="tpl-mission"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="Describe what this agent role should do..."
              rows={4}
              maxLength={1000}
              required
            />
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
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !name.trim() || !mission.trim()}
            >
              {loading ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
