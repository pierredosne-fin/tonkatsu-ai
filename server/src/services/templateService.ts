import { v4 as uuidv4 } from 'uuid';
import type { AgentTemplate, TeamTemplate } from '../models/types.js';
import { loadTemplates, saveTemplates } from './persistenceService.js';

let agentTemplates: AgentTemplate[] = [];
let teamTemplates: TeamTemplate[] = [];

export function loadAllTemplates(): void {
  const data = loadTemplates();
  agentTemplates = data.agentTemplates;
  teamTemplates = data.teamTemplates;
}

function persist(): void {
  saveTemplates({ agentTemplates, teamTemplates });
}

// ── Agent Templates ───────────────────────────────────────────────────────────

export function getAllAgentTemplates(): AgentTemplate[] {
  return [...agentTemplates];
}

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return agentTemplates.find((t) => t.id === id);
}

export function createAgentTemplate(params: {
  name: string;
  mission: string;
  avatarColor: string;
}): AgentTemplate {
  const template: AgentTemplate = {
    id: uuidv4(),
    name: params.name,
    mission: params.mission,
    avatarColor: params.avatarColor,
    createdAt: new Date().toISOString(),
  };
  agentTemplates.push(template);
  persist();
  return template;
}

export function deleteAgentTemplate(id: string): boolean {
  const idx = agentTemplates.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  agentTemplates.splice(idx, 1);
  // Remove from any team templates that reference it
  for (const tt of teamTemplates) {
    tt.agentTemplateIds = tt.agentTemplateIds.filter((aid) => aid !== id);
  }
  persist();
  return true;
}

// ── Team Templates ────────────────────────────────────────────────────────────

export function getAllTeamTemplates(): TeamTemplate[] {
  return [...teamTemplates];
}

export function getTeamTemplate(id: string): TeamTemplate | undefined {
  return teamTemplates.find((t) => t.id === id);
}

export function createTeamTemplate(params: {
  name: string;
  agentTemplateIds: string[];
}): TeamTemplate | { error: string } {
  for (const aid of params.agentTemplateIds) {
    if (!agentTemplates.find((a) => a.id === aid)) {
      return { error: `Agent template ${aid} not found` };
    }
  }
  const template: TeamTemplate = {
    id: uuidv4(),
    name: params.name,
    agentTemplateIds: params.agentTemplateIds,
    createdAt: new Date().toISOString(),
  };
  teamTemplates.push(template);
  persist();
  return template;
}

export function deleteTeamTemplate(id: string): boolean {
  const idx = teamTemplates.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  teamTemplates.splice(idx, 1);
  persist();
  return true;
}
