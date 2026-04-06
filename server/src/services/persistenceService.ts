import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Agent, Message, AgentTemplate, TeamTemplate } from '../models/types.js';

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
      // If it has sub-dirs with agent.json → it's a team folder
      const subEntries = readdirSync(dir, { withFileTypes: true });
      const isTeam = subEntries.some((sub) => {
        if (!sub.isDirectory()) return false;
        return existsSync(join(dir, sub.name, 'agent.json'));
      });
      // Also treat as team if it has agents.json but no direct agent.json
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
  workspacePath?: string; // optional override pointing to external project
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
  configDir: string;  // where agent.json lives
  workspacePath: string; // the actual workspace (may differ for external)
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
        // Old-style: agent directly in workspaces/ → default team
        discovered.push({
          teamId: DEFAULT_TEAM,
          configDir: dir,
          workspacePath: dir,
          config: directConfig,
        });
        continue;
      }

      // New-style: team folder — scan subdirs
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

// ── Conversation history (history.jsonl per agent workspace) ─────────────────

export interface ConversationSession {
  file: string;
  isCurrent: boolean;
  messageCount: number;
  label: string;
}

export function archiveHistory(workspacePath: string): void {
  const current = join(workspacePath, 'history.jsonl');
  if (!existsSync(current)) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    renameSync(current, join(workspacePath, `history-${timestamp}.jsonl`));
  } catch (err) {
    console.warn('[persistence] Failed to archive history:', err);
  }
}

export function listSessions(workspacePath: string): ConversationSession[] {
  if (!existsSync(workspacePath)) return [];
  const sessions: ConversationSession[] = [];
  try {
    const files = readdirSync(workspacePath)
      .filter((f) => f === 'history.jsonl' || /^history-.*\.jsonl$/.test(f));
    for (const file of files) {
      const messages = loadHistoryFromFile(join(workspacePath, file));
      const isCurrent = file === 'history.jsonl';
      let label: string;
      if (isCurrent) {
        label = 'Current session';
      } else {
        // Parse timestamp from filename: history-2024-01-01T12-30-00-000Z.jsonl
        const raw = file.replace('history-', '').replace('.jsonl', '');
        // Restore ISO format: replace last three groups of -XX with :XX
        const iso = raw.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z/, '$1:$2:$3.$4Z');
        const date = new Date(iso);
        label = isNaN(date.getTime()) ? raw : date.toLocaleString();
      }
      sessions.push({ file, isCurrent, messageCount: messages.length, label });
    }
  } catch (err) {
    console.warn('[persistence] Failed to list sessions:', err);
  }
  return sessions.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : b.file.localeCompare(a.file)));
}

export function loadHistoryFromFile(filePath: string): Message[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Message);
  } catch { return []; }
}

export function writeFullHistory(workspacePath: string, messages: Message[]): void {
  const p = join(workspacePath, 'history.jsonl');
  try {
    writeFileSync(
      p,
      messages.map((m) => JSON.stringify(m)).join('\n') + (messages.length ? '\n' : ''),
      'utf-8',
    );
  } catch (err) {
    console.warn('[persistence] Failed to write full history:', err);
  }
}

export function saveHistory(workspacePath: string, message: Message): void {
  try {
    mkdirSync(workspacePath, { recursive: true });
    appendFileSync(join(workspacePath, 'history.jsonl'), JSON.stringify(message) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[persistence] Failed to append history:', err);
  }
}

export function loadHistory(workspacePath: string): Message[] {
  const p = join(workspacePath, 'history.jsonl');
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Message);
  } catch (err) {
    console.warn('[persistence] Failed to load history:', err);
    return [];
  }
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
  lastActivity: string;
  createdAt: string;
}

export function saveAgents(agents: Agent[]): void {
  // Group by team
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
      // Backfill teamId for old records that don't have it
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
