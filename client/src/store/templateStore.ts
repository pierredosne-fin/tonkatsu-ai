import { create } from 'zustand';
import type { AgentTemplate, TeamTemplate } from '../types';

interface TemplateStore {
  agentTemplates: AgentTemplate[];
  teamTemplates: TeamTemplate[];
  fetchAll: () => Promise<void>;
  createAgentTemplate: (params: { name: string; mission: string; avatarColor: string }) => Promise<AgentTemplate | null>;
  createFromAgent: (agentId: string) => Promise<AgentTemplate | null>;
  updateAgentTemplate: (id: string, params: { name: string; mission: string; avatarColor: string }) => Promise<AgentTemplate | null>;
  createTeamTemplate: (params: { name: string; agentTemplateIds: string[] }) => Promise<TeamTemplate | null>;
  updateTeamTemplate: (id: string, params: { name?: string; agentTemplateIds?: string[] }) => Promise<TeamTemplate | null>;
  deleteAgentTemplate: (id: string) => Promise<void>;
  deleteTeamTemplate: (id: string) => Promise<void>;
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  agentTemplates: [],
  teamTemplates: [],

  fetchAll: async () => {
    const [agentsRes, teamsRes] = await Promise.all([
      fetch('/api/templates/agents'),
      fetch('/api/templates/teams'),
    ]);
    if (agentsRes.ok && teamsRes.ok) {
      const [agentTemplates, teamTemplates] = await Promise.all([
        agentsRes.json() as Promise<AgentTemplate[]>,
        teamsRes.json() as Promise<TeamTemplate[]>,
      ]);
      set({ agentTemplates, teamTemplates });
    }
  },

  createFromAgent: async (agentId) => {
    const res = await fetch(`/api/templates/agents/from-agent/${agentId}`, { method: 'POST' });
    if (!res.ok) return null;
    const template: AgentTemplate = await res.json();
    await get().fetchAll();
    return template;
  },

  createAgentTemplate: async (params) => {
    const res = await fetch('/api/templates/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const template: AgentTemplate = await res.json();
    await get().fetchAll();
    return template;
  },

  updateAgentTemplate: async (id, params) => {
    const res = await fetch(`/api/templates/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const template: AgentTemplate = await res.json();
    await get().fetchAll();
    return template;
  },

  updateTeamTemplate: async (id, params) => {
    const res = await fetch(`/api/templates/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const template: TeamTemplate = await res.json();
    await get().fetchAll();
    return template;
  },

  createTeamTemplate: async (params) => {
    const res = await fetch('/api/templates/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const template: TeamTemplate = await res.json();
    await get().fetchAll();
    return template;
  },

  deleteAgentTemplate: async (id) => {
    await fetch(`/api/templates/agents/${id}`, { method: 'DELETE' });
    await get().fetchAll();
  },

  deleteTeamTemplate: async (id) => {
    await fetch(`/api/templates/teams/${id}`, { method: 'DELETE' });
    await get().fetchAll();
  },
}));
