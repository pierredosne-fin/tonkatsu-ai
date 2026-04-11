import { create } from 'zustand';
import type { SkillTemplate } from '../types';

interface SkillStore {
  skills: SkillTemplate[];
  fetchAll: () => Promise<void>;
  createSkill: (params: { name: string; description: string; content: string; tags?: string[]; category?: string }) => Promise<SkillTemplate | null>;
  updateSkill: (id: string, params: { name?: string; description?: string; content?: string; tags?: string[]; category?: string }) => Promise<SkillTemplate | null>;
  deleteSkill: (id: string) => Promise<void>;
  addToAgent: (skillId: string, agentId: string) => Promise<boolean>;
  generateContent: (name: string, description: string) => Promise<string | null>;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],

  fetchAll: async () => {
    const res = await fetch('/api/skills');
    if (res.ok) {
      const skills: SkillTemplate[] = await res.json();
      set({ skills });
    }
  },

  createSkill: async (params) => {
    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const skill: SkillTemplate = await res.json();
    await get().fetchAll();
    return skill;
  },

  updateSkill: async (id, params) => {
    const res = await fetch(`/api/skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const skill: SkillTemplate = await res.json();
    await get().fetchAll();
    return skill;
  },

  deleteSkill: async (id) => {
    await fetch(`/api/skills/${id}`, { method: 'DELETE' });
    await get().fetchAll();
  },

  addToAgent: async (skillId, agentId) => {
    const res = await fetch(`/api/skills/${skillId}/add-to-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    return res.ok;
  },

  generateContent: async (name, description) => {
    const res = await fetch('/api/skills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) return null;
    const { content } = await res.json();
    return content as string;
  },
}));
