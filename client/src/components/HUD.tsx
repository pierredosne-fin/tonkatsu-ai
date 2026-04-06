import { useState, useEffect } from 'react';
import { useAgentStore } from '../store/agentStore';
import { requestDesktopNotifications } from '../store/socketStore';

interface Props {
  onAddAgent: () => void;
  onOpenTemplates: () => void;
  connected: boolean;
}

export function HUD({ onAddAgent, onOpenTemplates, connected }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const teamAgentCount = agents.filter((a) => a.teamId === currentTeamId).length;
  const ROOMS_PER_TEAM = 10;
  const full = teamAgentCount >= ROOMS_PER_TEAM;
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

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
        <h1 className="hud-title">🏢 My Team</h1>
        <span className={`hud-connection ${connected ? 'hud-connection--on' : 'hud-connection--off'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
      <div className="hud-right">
        <span className="hud-count">{agents.length} agents</span>
        {notifPerm !== 'granted' && notifPerm !== 'denied' && (
          <button className="btn btn-ghost" onClick={handleEnableNotifs} title="Enable desktop notifications">
            🔔 Enable alerts
          </button>
        )}
        {notifPerm === 'granted' && (
          <span className="hud-notif-on" title="Desktop notifications enabled">🔔</span>
        )}
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
