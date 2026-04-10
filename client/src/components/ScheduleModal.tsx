import { useEffect, useState } from 'react';
import type { CronSchedule } from '../types';

interface Props {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ScheduleModal({ agentId, agentName, onClose }: Props) {
  const [schedules, setSchedules] = useState<CronSchedule[]>([]);
  const [newExpr, setNewExpr] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchSchedules() {
    const res = await fetch(`/api/schedules?agentId=${agentId}`);
    if (res.ok) setSchedules(await res.json());
  }

  useEffect(() => { fetchSchedules(); }, [agentId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, cronExpression: newExpr.trim(), message: newMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create schedule');
      } else {
        setSchedules((prev) => [...prev, data]);
        setNewExpr('');
        setNewMessage('');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(s: CronSchedule) {
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

  async function handleDelete(id: string) {
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    if (res.ok) setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--schedule" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedules — {agentName}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="schedule-body">
          {schedules.length === 0 ? (
            <p className="schedule-empty">No schedules yet.</p>
          ) : (
            <ul className="schedule-list">
              {schedules.map((s) => (
                <li key={s.id} className={`schedule-item ${s.enabled ? '' : 'schedule-item--disabled'}`}>
                  <div className="schedule-item-main">
                    <code className="schedule-expr">{s.cronExpression}</code>
                    <span className="schedule-message">{s.message}</span>
                  </div>
                  <div className="schedule-item-meta">
                    {s.lastFiredAt && (
                      <span className="schedule-last-fired" title={s.lastFiredAt}>
                        Last: {relativeTime(s.lastFiredAt)}
                      </span>
                    )}
                    <button
                      className={`btn btn-ghost btn-sm ${s.enabled ? 'schedule-toggle--on' : 'schedule-toggle--off'}`}
                      onClick={() => handleToggle(s)}
                      title={s.enabled ? 'Disable' : 'Enable'}
                    >
                      {s.enabled ? '⏸' : '▶'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(s.id)}
                      title="Delete schedule"
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form className="schedule-add-form" onSubmit={handleAdd}>
            <h3>Add schedule</h3>
            <div className="schedule-add-fields">
              <div className="schedule-field">
                <input
                  type="text"
                  placeholder="Cron expression"
                  value={newExpr}
                  onChange={(e) => setNewExpr(e.target.value)}
                  required
                />
                <span className="schedule-hint">e.g. <code>0 9 * * *</code> = every day at 9am</span>
              </div>
              <input
                type="text"
                placeholder="Message to send"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                required
              />
            </div>
            {error && <p className="schedule-error">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading || !newExpr.trim() || !newMessage.trim()}
            >
              Add schedule
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
