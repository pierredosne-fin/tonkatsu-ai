import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useAgentStore } from './store/agentStore';
import { useSocketStore } from './store/socketStore';
import { useTemplateStore } from './store/templateStore';
import { useSkillStore } from './store/skillStore';
import { useConfigStore } from './store/configStore';
import { HUD } from './components/HUD';
import { TeamTabs } from './components/TeamTabs';
import { OfficeMap } from './components/OfficeMap';
import { AgentSidebar } from './components/AgentSidebar';
import { CreateAgentModal } from './components/CreateAgentModal';
import { ChatModal } from './components/ChatModal';
import { ToastStack } from './components/ToastStack';
import { TemplatesPanel } from './components/TemplatesPanel';
import { WorkspaceSyncModal } from './components/WorkspaceSyncModal';
import { FanOutModal } from './components/FanOutModal';

export default function App() {
  const { connected } = useSocket();
  const readOnly = useConfigStore((s) => s.readOnly);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const currentTeamId = useAgentStore((s) => s.currentTeamId);
  const setCurrentTeam = useAgentStore((s) => s.setCurrentTeam);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [chatAgentId, setChatAgentId] = useState<string | null>(null);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const agents = useAgentStore((s) => s.agents);
  const pendingFanOut = useAgentStore((s) => s.pendingFanOut);

  useEffect(() => {
    fetchConfig();
    useTemplateStore.getState().fetchAll();
    useSkillStore.getState().fetchAll();
  }, []);

  // Reload page when workspace sync completes
  const socket = useSocketStore((s) => s.socket);
  useEffect(() => {
    if (!socket) return;
    const handler = () => window.location.reload();
    socket.on('workspace:synced', handler);
    return () => { socket.off('workspace:synced', handler); };
  }, [socket]);

  const handleCreate = async (
    name: string,
    mission: string,
    avatarColor: string,
    teamId?: string,
    agentTemplateId?: string,
    canCreateAgents?: boolean,
    repoUrl?: string,
    repoBranch?: string,
  ) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mission, avatarColor, teamId, agentTemplateId, canCreateAgents, repoUrl, repoBranch }),
    });
    if (res.ok) {
      setShowCreate(false);
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to create agent');
    }
  };

  const handleDelete = async (agentId: string) => {
    await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
  };

  const handleEdit = async (agentId: string, name: string, mission: string, avatarColor: string, canCreateAgents: boolean) => {
    const res = await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mission, avatarColor, canCreateAgents }),
    });
    if (res.ok) {
      setEditAgentId(null);
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to update agent');
    }
  };

  const handleCreateTeam = (teamId: string) => {
    setCurrentTeam(teamId);
    setShowCreate(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
  };

  return (
    <div className="app">
      <HUD onAddAgent={() => setShowCreate(true)} onOpenTemplates={() => setShowTemplates(true)} onOpenSync={() => setShowSync(true)} connected={connected} readOnly={readOnly} />
      <TeamTabs onCreateTeam={handleCreateTeam} onDeleteTeam={handleDeleteTeam} onOpenTemplates={() => setShowTemplates(true)} readOnly={readOnly} />
      <div className="main">
        <OfficeMap
          onAgentClick={(id) => setChatAgentId(id)}
          onEmptyRoomClick={readOnly ? undefined : () => setShowCreate(true)}
          onEditAgent={readOnly ? undefined : (id) => setEditAgentId(id)}
          onDeleteAgent={readOnly ? undefined : handleDelete}
        />
        <AgentSidebar onAgentClick={(id) => setChatAgentId(id)} />
      </div>

      {showCreate && !readOnly && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          teamId={currentTeamId ?? undefined}
        />
      )}

      {editAgentId && !readOnly && (() => {
        const agent = agents.find((a) => a.id === editAgentId);
        return agent ? (
          <CreateAgentModal
            onClose={() => setEditAgentId(null)}
            onCreate={handleCreate}
            onEdit={handleEdit}
            editAgent={agent}
          />
        ) : null;
      })()}

      {chatAgentId && (
        <ChatModal
          agentId={chatAgentId}
          onClose={() => setChatAgentId(null)}
          onDelete={readOnly ? undefined : handleDelete}
          onEdit={readOnly ? undefined : (id) => { setChatAgentId(null); setEditAgentId(id); }}
          readOnly={readOnly}
        />
      )}

      <ToastStack />
      <FanOutModal key={pendingFanOut?.id ?? 'none'} />
      {showSync && <WorkspaceSyncModal onClose={() => setShowSync(false)} />}
      {showTemplates && <TemplatesPanel onClose={() => setShowTemplates(false)} />}
    </div>
  );
}
