import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, chmodSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import type { Agent, AgentTemplate, TeamTemplate, CronSchedule, SkillTemplate, GitSync } from '../models/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .sync-data/ lives at the project root — completely outside workspaces/ so git/rsync syncs never touch it
const SYNC_DATA_DIR = join(__dirname, '../../../.sync-data');
export const SSH_KEYS_DIR = join(SYNC_DATA_DIR, 'ssh-keys');
const SYNC_CONFIG_PATH = join(SYNC_DATA_DIR, 'config.json');

export const WORKSPACES_DIR: string = join(__dirname, '../../../workspaces');
export const REPOS_DIR: string = join(__dirname, '../../../repos');


export const GLOBAL_SSH_KEY_NAME = 'default';

export function hasGlobalSshKey(): boolean {
  return existsSync(getSshKeyPath(GLOBAL_SSH_KEY_NAME));
}

export interface WorkspaceSyncConfig {
  remoteUrl: string;
  branch: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;
}

export function getWorkspaceSyncConfig(): WorkspaceSyncConfig | null {
  if (!existsSync(SYNC_CONFIG_PATH)) return null;
  try { return JSON.parse(readFileSync(SYNC_CONFIG_PATH, 'utf-8')); } catch { return null; }
}

export function saveWorkspaceSyncConfig(cfg: WorkspaceSyncConfig): void {
  mkdirSync(SYNC_DATA_DIR, { recursive: true });
  writeFileSync(SYNC_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ── Team helpers ─────────────────────────────────────────────────────────────

export const DEFAULT_TEAM = 'default';

export function teamDisplayName(teamId: string): string {
  return teamId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function teamRuntimePath(teamId: string): string {
  return join(WORKSPACES_DIR, teamId, 'agents.json');
}

export function getTeamIds(): string[] {
  if (!existsSync(WORKSPACES_DIR)) return [DEFAULT_TEAM];
  const ids = new Set<string>([DEFAULT_TEAM]);
  try {
    const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(WORKSPACES_DIR, entry.name, 'agents.json'))) {
        ids.add(entry.name);
      }
    }
  } catch (err) {
    console.warn('[persistence] Failed to scan teams:', err);
  }
  return Array.from(ids);
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
  gitSync?: GitSync;
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
      gitSync: a.gitSync,
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

// ── Schedules (schedules.json at workspace root) ──────────────────────────────

const SCHEDULES_PATH = () => join(WORKSPACES_DIR, 'schedules.json');

export function loadSchedules(): CronSchedule[] {
  const p = SCHEDULES_PATH();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as CronSchedule[];
  } catch {
    return [];
  }
}

export function saveSchedules(schedules: CronSchedule[]): void {
  try {
    mkdirSync(WORKSPACES_DIR, { recursive: true });
    writeFileSync(SCHEDULES_PATH(), JSON.stringify(schedules, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[persistence] Failed to save schedules:', err);
  }
}

// ── Skill Library (skills.json at workspace root) ─────────────────────────────

const SKILLS_PATH = () => join(WORKSPACES_DIR, 'skills.json');

export function loadSkills(): SkillTemplate[] {
  const p = SKILLS_PATH();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SkillTemplate[];
  } catch {
    return [];
  }
}

export function saveSkills(skills: SkillTemplate[]): void {
  try {
    mkdirSync(WORKSPACES_DIR, { recursive: true });
    writeFileSync(SKILLS_PATH(), JSON.stringify(skills, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[persistence] Failed to save skills:', err);
  }
}

// ── SSH Key Storage (.ssh/ dir, gitignored) ───────────────────────────────────

export function listSshKeys(): string[] {
  if (!existsSync(SSH_KEYS_DIR)) return [];
  try {
    return readdirSync(SSH_KEYS_DIR)
      .filter((f) => !f.startsWith('.'))
      .map((f) => basename(f));
  } catch {
    return [];
  }
}

export function saveSshKey(name: string, content: string): void {
  mkdirSync(SSH_KEYS_DIR, { recursive: true }); // creates .sync-data/ssh-keys/ if needed
  const keyPath = join(SSH_KEYS_DIR, name);
  writeFileSync(keyPath, content, 'utf-8');
  try { chmodSync(keyPath, 0o600); } catch { /* ignore on windows */ }
}

export function deleteSshKey(name: string): void {
  const keyPath = join(SSH_KEYS_DIR, name);
  if (existsSync(keyPath)) unlinkSync(keyPath);
}

export function getSshKeyPath(name: string): string {
  return join(SSH_KEYS_DIR, name);
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
