import { useEffect, useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import type { FanOutState, FanOutTaskStatus } from '../types';

interface Props {
  fanOut: FanOutState;
  onAgentClick: (agentId: string) => void;
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

const TASK_META: Record<FanOutTaskStatus, { icon: string; cls: string; label: (t: number | undefined) => string }> = {
  queued:  { icon: '○', cls: 'fo-task--queued',  label: () => 'Queued' },
  running: { icon: '●', cls: 'fo-task--running', label: () => 'Working…' },
  done:    { icon: '✓', cls: 'fo-task--done',    label: (t) => t ? `Done · ${elapsed(Date.now() - t)}` : 'Done' },
  failed:  { icon: '✕', cls: 'fo-task--failed',  label: (t) => t ? `Failed · ${elapsed(Date.now() - t)}` : 'Failed' },
};

function TaskRow({ task, onAgentClick }: { task: FanOutState['tasks'][number]; onAgentClick: (id: string) => void }) {
  const agents = useAgentStore((s) => s.agents);
  const agent = agents.find((a) => a.id === task.targetAgentId);
  const meta = TASK_META[task.status];
  const [, setTick] = useState(0);

  // Re-render every 5s to update elapsed labels
  useEffect(() => {
    if (task.status !== 'done' && task.status !== 'failed') return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [task.status]);

  return (
    <li
      className={`fo-task ${meta.cls}`}
      onClick={() => onAgentClick(task.targetAgentId)}
      title="Open agent chat"
    >
      <span className="fo-task__icon">{meta.icon}</span>
      {agent && (
        <span
          className="fo-task__avatar"
          style={{ background: agent.avatarColor }}
        >
          {agent.name[0].toUpperCase()}
        </span>
      )}
      <span className="fo-task__name">{agent?.name ?? task.targetAgentId}</span>
      <span className="fo-task__label">{meta.label(task.completedAt)}</span>
      {task.status === 'failed' && <span className="fo-task__hint">see chat</span>}
    </li>
  );
}

export function FanOutProgressPanel({ fanOut, onAgentClick }: Props) {
  const dismissFanOut = useAgentStore((s) => s.dismissFanOut);

  const total = fanOut.tasks.length;
  const done = fanOut.tasks.filter((t) => t.status === 'done').length;
  const failed = fanOut.tasks.filter((t) => t.status === 'failed').length;
  const settled = fanOut.settled;
  const allDone = done === total;
  const hasFailure = failed > 0;

  // Auto-collapse after 4s if all succeeded
  useEffect(() => {
    if (!settled || hasFailure) return;
    const t = setTimeout(() => dismissFanOut(fanOut.fanoutId), 4000);
    return () => clearTimeout(t);
  }, [settled, hasFailure, fanOut.fanoutId, dismissFanOut]);

  const panelCls = [
    'fo-panel',
    settled && allDone ? 'fo-panel--success' : '',
    settled && hasFailure ? 'fo-panel--failure' : '',
  ].filter(Boolean).join(' ');

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={panelCls}>
      <div className="fo-panel__header">
        <span className="fo-panel__title">📡 Fan-out: {total} task{total !== 1 ? 's' : ''}</span>
        <span className="fo-panel__progress-label">{done} of {total} done</span>
        <button
          className="fo-panel__dismiss"
          onClick={() => dismissFanOut(fanOut.fanoutId)}
          title="Dismiss"
        >✕</button>
      </div>

      <ul className="fo-task-list">
        {fanOut.tasks.map((task) => (
          <TaskRow key={task.taskId} task={task} onAgentClick={onAgentClick} />
        ))}
      </ul>

      <div className="fo-panel__progress-bar">
        <div className="fo-panel__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="fo-panel__pct">{pct}%</div>
    </div>
  );
}

/** Renders all active fan-out panels, positioned below their source agent's room. */
interface PanelsProps {
  gridRef: React.RefObject<HTMLDivElement | null>;
  onAgentClick: (agentId: string) => void;
}

export function FanOutPanels({ gridRef, onAgentClick }: PanelsProps) {
  const activeFanOuts = useAgentStore((s) => s.activeFanOuts);
  const agents = useAgentStore((s) => s.agents);
  const [positions, setPositions] = useState<Map<string, { left: number; top: number }>>(new Map());

  useEffect(() => {
    if (!gridRef.current || activeFanOuts.size === 0) { setPositions(new Map()); return; }
    const gridRect = gridRef.current.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    for (const [fanoutId, fanOut] of activeFanOuts) {
      const source = agents.find((a) => a.id === fanOut.sourceAgentId);
      if (!source) continue;
      const el = gridRef.current.querySelector<HTMLElement>(`[data-room-id="${source.roomId}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next.set(fanoutId, {
        left: r.left - gridRect.left,
        top: r.bottom - gridRect.top + 8,
      });
    }
    setPositions(next);
  }, [activeFanOuts, agents, gridRef]);

  return (
    <>
      {Array.from(activeFanOuts.values()).map((fanOut) => {
        const pos = positions.get(fanOut.fanoutId);
        if (!pos) return null;
        return (
          <div
            key={fanOut.fanoutId}
            className="fo-panel-anchor"
            style={{ left: pos.left, top: pos.top }}
          >
            <FanOutProgressPanel fanOut={fanOut} onAgentClick={onAgentClick} />
          </div>
        );
      })}
    </>
  );
}
