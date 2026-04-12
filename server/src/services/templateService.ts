import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { rmSync, existsSync, readdirSync, mkdirSync } from 'fs';
import type { AgentTemplate, TeamTemplate } from '../models/types.js';
import { loadTemplates, saveTemplates, WORKSPACES_DIR } from './persistenceService.js';

export function getAgentTemplateWorkspacePath(templateId: string): string {
  return join(WORKSPACES_DIR, 'templates', templateId);
}

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

export function getPublicAgentTemplates(): AgentTemplate[] {
  return agentTemplates.filter((t) => t.isPublic);
}

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return agentTemplates.find((t) => t.id === id);
}

export function createAgentTemplate(params: {
  name: string;
  mission: string;
  avatarColor: string;
  repoUrl?: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
}): AgentTemplate {
  const template: AgentTemplate = {
    id: uuidv4(),
    name: params.name,
    mission: params.mission,
    avatarColor: params.avatarColor,
    repoUrl: params.repoUrl || undefined,
    description: params.description,
    tags: params.tags,
    isPublic: params.isPublic ?? false,
    category: params.category,
    createdAt: new Date().toISOString(),
  };
  agentTemplates.push(template);
  persist();
  mkdirSync(getAgentTemplateWorkspacePath(template.id), { recursive: true });
  return template;
}

export function updateAgentTemplate(id: string, params: {
  name?: string;
  mission?: string;
  avatarColor?: string;
  repoUrl?: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
}): AgentTemplate | null {
  const template = agentTemplates.find((t) => t.id === id);
  if (!template) return null;
  if (params.name !== undefined) template.name = params.name;
  if (params.mission !== undefined) template.mission = params.mission;
  if (params.avatarColor !== undefined) template.avatarColor = params.avatarColor;
  if (params.repoUrl !== undefined) template.repoUrl = params.repoUrl || undefined;
  if (params.description !== undefined) template.description = params.description;
  if (params.tags !== undefined) template.tags = params.tags;
  if (params.isPublic !== undefined) template.isPublic = params.isPublic;
  if (params.category !== undefined) template.category = params.category;
  persist();
  return template;
}

export function deleteAgentTemplate(id: string): boolean {
  const idx = agentTemplates.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  agentTemplates.splice(idx, 1);
  pruneTeamTemplates();
  persist();
  const dir = getAgentTemplateWorkspacePath(id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Remove stale agentTemplateIds from team templates, then drop team templates left empty. */
function pruneTeamTemplates(): void {
  const knownIds = new Set(agentTemplates.map((t) => t.id));
  for (const tt of teamTemplates) {
    tt.agentTemplateIds = tt.agentTemplateIds.filter((id) => knownIds.has(id));
  }
  const before = teamTemplates.length;
  teamTemplates.splice(0, teamTemplates.length, ...teamTemplates.filter((tt) => tt.agentTemplateIds.length > 0));
  if (teamTemplates.length < before) {
    console.log(`[templates] Removed ${before - teamTemplates.length} empty team template(s)`);
  }
}

export function syncTemplateFolders(): void {
  const templatesDir = join(WORKSPACES_DIR, 'templates');
  mkdirSync(templatesDir, { recursive: true });

  // 1. Create missing folders for templates that don't have one
  for (const t of agentTemplates) {
    const dir = getAgentTemplateWorkspacePath(t.id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[templates] Created missing folder for: ${t.name}`);
    }
  }

  // 2. Remove folders that have no corresponding template entry
  const knownIds = new Set(agentTemplates.map((t) => t.id));
  for (const entry of readdirSync(templatesDir)) {
    if (!knownIds.has(entry)) {
      rmSync(join(templatesDir, entry), { recursive: true, force: true });
      console.log(`[templates] Removed orphaned folder: ${entry}`);
    }
  }

  // 3. Prune team templates with stale agent references
  pruneTeamTemplates();
  persist();
}

// ── Team Templates ────────────────────────────────────────────────────────────

export function getAllTeamTemplates(): TeamTemplate[] {
  return [...teamTemplates];
}

export function getPublicTeamTemplates(): TeamTemplate[] {
  return teamTemplates.filter((t) => t.isPublic);
}

export function getTeamTemplate(id: string): TeamTemplate | undefined {
  return teamTemplates.find((t) => t.id === id);
}

export function createTeamTemplate(params: {
  name: string;
  agentTemplateIds: string[];
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
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
    description: params.description,
    tags: params.tags,
    isPublic: params.isPublic ?? false,
    category: params.category,
    createdAt: new Date().toISOString(),
  };
  teamTemplates.push(template);
  persist();
  return template;
}

export function updateTeamTemplate(id: string, params: {
  name?: string;
  agentTemplateIds?: string[];
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  category?: string;
}): TeamTemplate | null {
  const template = teamTemplates.find((t) => t.id === id);
  if (!template) return null;
  if (params.name !== undefined) template.name = params.name;
  if (params.agentTemplateIds !== undefined) template.agentTemplateIds = params.agentTemplateIds;
  if (params.description !== undefined) template.description = params.description;
  if (params.tags !== undefined) template.tags = params.tags;
  if (params.isPublic !== undefined) template.isPublic = params.isPublic;
  if (params.category !== undefined) template.category = params.category;
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

// ── Marketplace Search ────────────────────────────────────────────────────────

export interface MarketplaceSearchResult {
  agentTemplates: AgentTemplate[];
  teamTemplates: TeamTemplate[];
}

export function searchPublicTemplates(params: {
  q?: string;
  tags?: string[];
  category?: string;
}): MarketplaceSearchResult {
  const query = params.q?.toLowerCase().trim();

  let agents = agentTemplates.filter((t) => t.isPublic);
  let teams = teamTemplates.filter((t) => t.isPublic);

  if (query) {
    agents = agents.filter((t) =>
      t.name.toLowerCase().includes(query) ||
      t.mission.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
    teams = teams.filter((t) =>
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  if (params.category) {
    agents = agents.filter((t) => t.category === params.category);
    teams = teams.filter((t) => t.category === params.category);
  }

  if (params.tags && params.tags.length > 0) {
    agents = agents.filter((t) =>
      params.tags!.every((tag) => t.tags?.includes(tag))
    );
    teams = teams.filter((t) =>
      params.tags!.every((tag) => t.tags?.includes(tag))
    );
  }

  return { agentTemplates: agents, teamTemplates: teams };
}
