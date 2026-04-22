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
  const [selectedCron, setSelectedCron] = useState(CRON_OPTIONS[1].cron);
  const [selectedTtlMs, setSelectedTtlMs] = useState(TTL_OPTIONS[1].ms);

  if (!proposal) return null;

  const fromAgent = agents.find((a) => a.id === proposal.fromAgentId);

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fan-out/${proposal.id}/confirm`, { method: 'POST' });
      if (!res.ok) {
        setError('Dispatch failed — please try again.');
        return;
      }
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
      if (!res.ok) {
        setError('Failed to create schedule — please try again.');
        return;
      }
      setPendingFanOut(null);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'cron') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
          <div>
            <h2 className="text-white font-semibold text-lg">Tasks dispatched</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Would you like <span className="text-white">{fromAgent?.name ?? 'the agent'}</span> to
              periodically check on progress?
            </p>
          </div>

          <div>
            <p className="text-zinc-500 text-xs mb-2">Check interval</p>
            <div className="grid grid-cols-2 gap-2">
              {CRON_OPTIONS.map((opt) => (
                <button
                  key={opt.cron}
                  onClick={() => setSelectedCron(opt.cron)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                    selectedCron === opt.cron
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-zinc-500 text-xs mb-2">Stop after</p>
            <div className="grid grid-cols-4 gap-2">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  onClick={() => setSelectedTtlMs(opt.ms)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                    selectedTtlMs === opt.ms
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setPendingFanOut(null)}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition text-sm font-medium"
            >
              Skip
            </button>
            <button
              onClick={scheduleCron}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Scheduling…' : 'Set up cron'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div>
          <h2 className="text-white font-semibold text-lg">Parallel task dispatch</h2>
          <p className="text-zinc-400 text-sm mt-1">
            <span className="text-white">{fromAgent?.name ?? 'An agent'}</span> wants to assign{' '}
            {proposal.tasks.length} task{proposal.tasks.length !== 1 ? 's' : ''} in parallel.
          </p>
        </div>

        <ul className="space-y-2">
          {proposal.tasks.map((task, i) => (
            <li key={i} className="bg-zinc-800 rounded-lg px-4 py-3">
              <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{task.agent}</div>
              <div className="text-zinc-200 text-sm line-clamp-2">{task.prompt}</div>
            </li>
          ))}
        </ul>

        <p className="text-zinc-500 text-xs">
          Agents will start immediately and work independently. You will not receive a combined result.
        </p>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={reject}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition text-sm font-medium"
          >
            Reject
          </button>
          <button
            onClick={confirm}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Dispatching…' : `Dispatch ${proposal.tasks.length} tasks`}
          </button>
        </div>
      </div>
    </div>
  );
}
