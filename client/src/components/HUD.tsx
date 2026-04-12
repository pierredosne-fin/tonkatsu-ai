import { useState, useEffect } from 'react';
import { useAgentStore } from '../store/agentStore';
import { requestDesktopNotifications } from '../store/socketStore';

interface Props {
  onAddAgent: () => void;
  onOpenTemplates: () => void;
  onOpenSync: () => void;
  connected: boolean;
}

export function HUD({ onAddAgent, onOpenTemplates, onOpenSync, connected }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const teamAgentCount = agents.filter((a) => a.teamId === currentTeamId).length;
  const statusCounts = agents.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const ROOMS_PER_TEAM = 10;
  const full = teamAgentCount >= ROOMS_PER_TEAM;
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');
  const [title, setTitle] = useState(() => localStorage.getItem('app-title') ?? 'My Team');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => { document.title = `🏢 ${title}`; }, [title]);

  const commitTitle = () => {
    const t = titleDraft.trim() || 'My Team';
    setTitle(t);
    localStorage.setItem('app-title', t);
    setEditingTitle(false);
  };

  useEffect(() => {
    if ('Notification' in window) setNotifPerm(Notification.permission);
  }, []);

  const handleEnableNotifs = async () => {
    await requestDesktopNotifications();
    setNotifPerm(Notification.permission);
  };

  return (
    <header className="hud">
      <div className="hud-left">
        {editingTitle ? (
          <input
            className="hud-title-input"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
          />
        ) : (
          <h1
            className="hud-title"
            onDoubleClick={() => { setTitleDraft(title); setEditingTitle(true); }}
            title="Double-click to rename"
          >
            🏢 {title}
          </h1>
        )}
        <span className={`hud-connection ${connected ? 'hud-connection--on' : 'hud-connection--off'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
      <div className="hud-right">
        <span className="hud-count">
          {agents.length} agents
          {agents.length > 0 && (
            <span className="hud-status-breakdown">
              {statusCounts.working    ? <span className="hud-status-chip hud-status-chip--working">⚙️ {statusCounts.working} working</span> : null}
              {statusCounts.pending    ? <span className="hud-status-chip hud-status-chip--pending">❗ {statusCounts.pending} waiting for input</span> : null}
              {statusCounts.delegating ? <span className="hud-status-chip hud-status-chip--delegating">📨 {statusCounts.delegating} delegating</span> : null}
              {statusCounts.sleeping   ? <span className="hud-status-chip hud-status-chip--sleeping">💤 {statusCounts.sleeping} sleeping</span> : null}
            </span>
          )}
        </span>
        {notifPerm !== 'granted' && notifPerm !== 'denied' && (
          <button className="btn btn-ghost" onClick={handleEnableNotifs} title="Enable desktop notifications">
            🔔 Enable alerts
          </button>
        )}
        {notifPerm === 'granted' && (
          <span className="hud-notif-on" title="Desktop notifications enabled">🔔</span>
        )}
        <button className="btn btn-ghost" onClick={onOpenSync} title="Configure workspace git sync">
          ↓ Sync
        </button>
        <button className="btn btn-ghost" onClick={onOpenTemplates}>
          Templates
        </button>
        <button
          className="btn btn-primary"
          onClick={onAddAgent}
          disabled={full}
          title={full ? `All ${ROOMS_PER_TEAM} offices occupied` : 'Create a new agent'}
        >
          + Add Agent
        </button>
      </div>
    </header>
  );
}
