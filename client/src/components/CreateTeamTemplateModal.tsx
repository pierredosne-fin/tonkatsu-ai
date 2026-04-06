import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTeamTemplateModal({ onClose, onCreated }: Props) {
  const agentTemplates = useTemplateStore((s) => s.agentTemplates);
  const createTeamTemplate = useTemplateStore((s) => s.createTeamTemplate);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addAgent = () => {
    if (agentTemplates.length === 0 || selectedIds.length >= 9) return;
    setSelectedIds((prev) => [...prev, agentTemplates[0].id]);
  };

  const updateAgent = (index: number, id: string) => {
    setSelectedIds((prev) => prev.map((v, i) => (i === index ? id : v)));
  };

  const removeAgent = (index: number) => {
    setSelectedIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedIds.length === 0) return;
    setLoading(true);
    const result = await createTeamTemplate({ name: name.trim(), agentTemplateIds: selectedIds });
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
          <h2>New Team Template</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="tpl-team-name">Team Template Name</label>
            <input
              id="tpl-team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finary Core, Full-Stack Trio"
              maxLength={50}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Agents in this template</label>
            {agentTemplates.length === 0 ? (
              <p className="form-hint-block">No agent templates yet. Create some first.</p>
            ) : (
              <>
                {selectedIds.length === 0 && (
                  <p className="form-hint-block">Add at least one agent to this team.</p>
                )}
                {selectedIds.map((id, index) => {
                  const tpl = agentTemplates.find((t) => t.id === id);
                  return (
                    <div key={index} className="team-tpl-agent-row">
                      {tpl && (
                        <span
                          className="template-dot"
                          style={{ backgroundColor: tpl.avatarColor }}
                        />
                      )}
                      <select
                        value={id}
                        onChange={(e) => updateAgent(index, e.target.value)}
                        className="team-tpl-select"
                      >
                        {agentTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeAgent(index)}
                      >✕</button>
                    </div>
                  );
                })}
                {selectedIds.length < 9 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addAgent}>
                    + Add agent
                  </button>
                )}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !name.trim() || selectedIds.length === 0 || agentTemplates.length === 0}
            >
              {loading ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
