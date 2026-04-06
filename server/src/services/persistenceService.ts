import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Agent, AgentTemplate, TeamTemplate } from '../models/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKSPACES_DIR = join(__dirname, '../../../workspaces');

// ── Team helpers ─────────────────────────────────────────────────────────────

export const DEFAULT_TEAM = 'default';

export function teamDisplayName(teamId: string): string {
  return teamId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function teamRuntimePath(teamId: string): string {
  if (teamId === DEFAULT_TEAM) return join(WORKSPACES_DIR, 'agents.json');
  return join(WORKSPACES_DIR, teamId, 'agents.json');
}

export function getTeamIds(): string[] {
  if (!existsSync(WORKSPACES_DIR)) return [DEFAULT_TEAM];
  const ids = new Set<string>([DEFAULT_TEAM]);
  try {
    const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(WORKSPACES_DIR, entry.name);
      const subEntries = readdirSync(dir, { withFileTypes: true });
      const isTeam = subEntries.some((sub) => {
        if (!sub.isDirectory()) return false;
        return existsSync(join(dir, sub.name, 'agent.json'));
      });
      const hasAgentsJson = existsSync(join(dir, 'agents.json'));
      const hasDirectAgentJson = existsSync(join(dir, 'agent.json'));
      if ((isTeam || hasAgentsJson) && !hasDirectAgentJson) {
        ids.add(entry.name);
      }
    }
  } catch (err) {
    console.warn('[persistence] Failed to scan teams:', err);
  }
  return Array.from(ids);
}

// ── Agent config (agent.json per workspace) ──────────────────────────────────

export interface AgentConfig {
  name: string;
  mission: string;
  avatarColor: string;
  workspacePath?: string;
}

export function writeAgentConfig(configDir: string, config: AgentConfig): void {
  mkdirSync(configDir, { recursive: true });
  try {
    writeFileSync(join(configDir, 'agent.json'), JSON.stringify({
      name: config.name,
      mission: config.mission,
      avatarColor: config.avatarColor,
    }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[persistence] Failed to write agent.json:', err);
  }
}

export function readAgentConfig(dir: string): AgentConfig | null {
  const p = join(dir, 'agent.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as AgentConfig;
  } catch { return null; }
}

// ── Scan workspaces for agent.json files ─────────────────────────────────────

export interface DiscoveredWorkspace {
  teamId: string;
  configDir: string;
  workspacePath: string;
  config: AgentConfig;
}

export function scanAllWorkspaceAgents(): DiscoveredWorkspace[] {
  if (!existsSync(WORKSPACES_DIR)) return [];
  const discovered: DiscoveredWorkspace[] = [];
  try {
    const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(WORKSPACES_DIR, entry.name);

      const directConfig = readAgentConfig(dir);
      if (directConfig) {
        discovered.push({ teamId: DEFAULT_TEAM, configDir: dir, workspacePath: dir, config: directConfig });
        continue;
      }

      try {
        const subEntries = readdirSync(dir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          const subDir = join(dir, sub.name);
          const config = readAgentConfig(subDir);
          if (config) {
            discovered.push({
              teamId: entry.name,
              configDir: subDir,
              workspacePath: config.workspacePath ?? subDir,
              config,
            });
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
  } catch (err) {
    console.warn('[persistence] Failed to scan workspaces:', err);
  }
  return discovered;
}

// ── Runtime state (agents.json per team) ─────────────────────────────────────

export interface PersistedAgent {
  id: string;
  name: string;
  mission: string;
  avatarColor: string;
  roomId: string;
  teamId: string;
  workspacePath: string;
  worktreeOf?: string;
  sessionId?: string;
  canCreateAgents?: boolean;
  lastActivity: string;
  createdAt: string;
}

export function saveAgents(agents: Agent[]): void {
  const byTeam = new Map<string, Agent[]>();
  for (const a of agents) {
    const list = byTeam.get(a.teamId) ?? [];
    list.push(a);
    byTeam.set(a.teamId, list);
  }
  for (const [teamId, teamAgents] of byTeam) {
    const path = teamRuntimePath(teamId);
    mkdirSync(dirname(path), { recursive: true });
    const data: PersistedAgent[] = teamAgents.map((a) => ({
      id: a.id,
      name: a.name,
      mission: a.mission,
      avatarColor: a.avatarColor,
      roomId: a.roomId,
      teamId: a.teamId,
      workspacePath: a.workspacePath,
      worktreeOf: a.worktreeOf,
      sessionId: a.sessionId,
      canCreateAgents: a.canCreateAgents,
      lastActivity: a.lastActivity.toISOString(),
      createdAt: a.createdAt.toISOString(),
    }));
    try {
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[persistence] Failed to save agents for team ${teamId}:`, err);
    }
  }
}

// ── Templates (templates.json at workspace root) ──────────────────────────────

const TEMPLATES_PATH = () => join(WORKSPACES_DIR, 'templates.json');

export function loadTemplates(): { agentTemplates: AgentTemplate[]; teamTemplates: TeamTemplate[] } {
  const p = TEMPLATES_PATH();
  if (!existsSync(p)) return { agentTemplates: [], teamTemplates: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return { agentTemplates: [], teamTemplates: [] };
  }
}

export function saveTemplates(data: { agentTemplates: AgentTemplate[]; teamTemplates: TeamTemplate[] }): void {
  try {
    writeFileSync(TEMPLATES_PATH(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[persistence] Failed to save templates:', err);
  }
}

export function loadAllAgents(): PersistedAgent[] {
  const all: PersistedAgent[] = [];
  const teamIds = getTeamIds();
  for (const teamId of teamIds) {
    const path = teamRuntimePath(teamId);
    if (!existsSync(path)) continue;
    try {
      const agents = JSON.parse(readFileSync(path, 'utf-8')) as PersistedAgent[];
      for (const a of agents) {
        if (!a.teamId) a.teamId = DEFAULT_TEAM;
        all.push(a);
      }
    } catch (err) {
      console.warn(`[persistence] Failed to load agents for team ${teamId}:`, err);
    }
  }
  return all;
}
