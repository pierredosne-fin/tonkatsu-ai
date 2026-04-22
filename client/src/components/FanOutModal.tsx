import { useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import { TTL_OPTIONS } from '../utils/ttl';

const CRON_OPTIONS = [
  { label: 'Every 5 min',  cron: '*/5 * * * *' },
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Every 30 min', cron: '*/30 * * * *' },
  { label: 'Every hour',   cron: '0 * * * *' },
];

type Step = 'confirm' | 'cron';

export function FanOutModal() {
  const proposal = useAgentStore((s) => s.pendingFanOut);
  const setPendingFanOut = useAgentStore((s) => s.setPendingFanOut);
  const agents = useAgentStore((s) => s.agents);

  const [step, setStep] = useState<Step>('confirm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [selectedCron, setSelectedCron] = useState(CRON_OPTIONS[1].cron);
  const [selectedTtlMs, setSelectedTtlMs] = useState(TTL_OPTIONS[1].ms);

  if (!proposal) return null;

  const fromAgent = agents.find((a) => a.id === proposal.fromAgentId);

  const toggleExpanded = (i: number) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fan-out/${proposal.id}/confirm`, { method: 'POST' });
      if (!res.ok) { setError('Dispatch failed — please try again.'); return; }
      setStep('cron');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reject = async () => {
    setLoading(true);
    try {
      await fetch(`/api/fan-out/${proposal.id}/reject`, { method: 'POST' });
      setPendingFanOut(null);
    } finally {
      setLoading(false);
    }
  };

  const scheduleCron = async () => {
    if (!fromAgent) { setPendingFanOut(null); return; }
    setLoading(true);
    setError(null);
    try {
      const agentNames = [...new Set(proposal.tasks.map((t) => t.agent))].join(', ');
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: proposal.fromAgentId,
          cronExpression: selectedCron,
          message: `Check on the progress of the parallel tasks you dispatched to: ${agentNames}. Report a brief status update for each.`,
          enabled: true,
          ttlMs: selectedTtlMs,
        }),
      });
      if (!res.ok) { setError('Failed to create schedule — please try again.'); return; }
      setPendingFanOut(null);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Cron scheduling step (post-dispatch) ─────────────────────────────────
  if (step === 'cron') {
    return (
      <div className="fanout-overlay">
        <div className="fanout-dialog">
          <div className="fanout-dialog__header">
            <div className="fanout-dialog__title">Tasks dispatched</div>
            <p className="fanout-dialog__subtitle">
              Would you like <strong>{fromAgent?.name ?? 'the agent'}</strong> to periodically check on progress?
            </p>
          </div>

          <div className="fanout-dialog__section">
            <p className="fanout-dialog__section-label">Check interval</p>
            <div className="fanout-dialog__grid fanout-dialog__grid--2">
              {CRON_OPTIONS.map((opt) => (
                <button
                  key={opt.cron}
                  className={`fanout-chip ${selectedCron === opt.cron ? 'fanout-chip--active' : ''}`}
                  onClick={() => setSelectedCron(opt.cron)}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <div className="fanout-dialog__section">
            <p className="fanout-dialog__section-label">Stop after</p>
            <div className="fanout-dialog__grid fanout-dialog__grid--4">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  className={`fanout-chip ${selectedTtlMs === opt.ms ? 'fanout-chip--active' : ''}`}
                  onClick={() => setSelectedTtlMs(opt.ms)}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          {error && <p className="fanout-dialog__error">{error}</p>}

          <div className="fanout-dialog__footer">
            <button className="fanout-btn fanout-btn--ghost" onClick={() => setPendingFanOut(null)} disabled={loading}>Skip</button>
            <button className="fanout-btn fanout-btn--primary" onClick={scheduleCron} disabled={loading}>
              {loading ? 'Scheduling…' : 'Set up cron'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirmation step ─────────────────────────────────────────────────────
  return (
    <div className="fanout-overlay">
      <div className="fanout-dialog">
        {/* Header */}
        <div className="fanout-dialog__header">
          {fromAgent && (
            <div
              className="fanout-dialog__source-avatar"
              style={{ background: fromAgent.avatarColor }}
            >
              {fromAgent.name[0].toUpperCase()}
            </div>
          )}
          <div>
            <div className="fanout-dialog__title">Dispatch parallel tasks?</div>
            <p className="fanout-dialog__subtitle">
              <strong>{fromAgent?.name ?? 'An agent'}</strong> wants to assign{' '}
              {proposal.tasks.length} task{proposal.tasks.length !== 1 ? 's' : ''} in parallel.
            </p>
          </div>
        </div>

        {/* Task list */}
        <ul className="fanout-task-list">
          {proposal.tasks.map((task, i) => {
            const targetAgent = agents.find((a) => a.name.toLowerCase() === task.agent.toLowerCase());
            const isBusy = targetAgent?.status === 'working' || targetAgent?.status === 'pending';
            const isExpanded = expandedTasks.has(i);
            const isLong = task.prompt.length > 120;

            return (
              <li key={i} className="fanout-task-card">
                <div className="fanout-task-card__header">
                  <div className="fanout-task-card__agent">
                    {targetAgent && (
                      <span
                        className="fanout-task-card__avatar"
                        style={{ background: targetAgent.avatarColor }}
                      >
                        {targetAgent.name[0].toUpperCase()}
                      </span>
                    )}
                    <span className="fanout-task-card__agent-name">{task.agent}</span>
                  </div>
                  {isBusy && <span className="fanout-task-card__busy">⚠ busy</span>}
                </div>
                <p className={`fanout-task-card__prompt ${!isExpanded && isLong ? 'fanout-task-card__prompt--clamp' : ''}`}>
                  {task.prompt}
                </p>
                {isLong && (
                  <button className="fanout-task-card__expand" onClick={() => toggleExpanded(i)}>
                    {isExpanded ? '▴ show less' : '▾ show more'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <p className="fanout-dialog__hint">
          Agents will start immediately and work independently.
        </p>

        {error && <p className="fanout-dialog__error">{error}</p>}

        <div className="fanout-dialog__footer">
          <button className="fanout-btn fanout-btn--ghost" onClick={reject} disabled={loading}>Cancel</button>
          <button className="fanout-btn fanout-btn--primary" onClick={confirm} disabled={loading}>
            {loading ? 'Dispatching…' : `Dispatch ${proposal.tasks.length} tasks →`}
          </button>
        </div>
      </div>
    </div>
  );
}
