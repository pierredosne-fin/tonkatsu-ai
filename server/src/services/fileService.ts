import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync, rmdirSync, rmSync, statSync, copyFileSync } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';

function safeRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function safeWrite(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

function listMdFiles(dir: string, prefix = ''): { name: string; content: string }[] {
  if (!existsSync(dir)) return [];
  const results: { name: string; content: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...listMdFiles(full, prefix ? `${prefix}/${entry}` : entry));
    } else if (extname(entry) === '.md') {
      const name = prefix ? `${prefix}/${basename(entry, '.md')}` : basename(entry, '.md');
      results.push({ name, content: readFileSync(full, 'utf-8') });
    }
  }
  return results;
}

function listSkills(dir: string): { name: string; content: string }[] {
  if (!existsSync(dir)) return [];
  const results: { name: string; content: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue; // skip .skill zip files etc.
    const skillMd = join(full, 'SKILL.md');
    results.push({ name: entry, content: existsSync(skillMd) ? readFileSync(skillMd, 'utf-8') : '' });
  }
  return results;
}

export interface WorkspaceFiles {
  claudeMd: string | null;
  soul: string | null;
  ops: string | null;
  tools: string | null;
  settings: string | null;
  commands: { name: string; content: string }[];
  rules: { name: string; content: string }[];
  skills: { name: string; content: string }[];
}

export function readWorkspaceFiles(workspacePath: string): WorkspaceFiles {
  return {
    claudeMd: safeRead(join(workspacePath, 'CLAUDE.md')),
    soul: safeRead(join(workspacePath, 'SOUL.md')),
    ops: safeRead(join(workspacePath, 'OPS.md')),
    tools: safeRead(join(workspacePath, 'TOOLS.md')),
    settings: safeRead(join(workspacePath, '.claude', 'settings.json')),
    commands: listMdFiles(join(workspacePath, '.claude', 'commands')),
    rules: listMdFiles(join(workspacePath, '.claude', 'rules')),
    skills: listSkills(join(workspacePath, '.claude', 'skills')),
  };
}

export function writeClaudeMd(workspacePath: string, content: string): void {
  safeWrite(join(workspacePath, 'CLAUDE.md'), content);
}

export function writeSoul(workspacePath: string, content: string): void {
  safeWrite(join(workspacePath, 'SOUL.md'), content);
}

export function writeOps(workspacePath: string, content: string): void {
  safeWrite(join(workspacePath, 'OPS.md'), content);
}

export function writeTools(workspacePath: string, content: string): void {
  safeWrite(join(workspacePath, 'TOOLS.md'), content);
}

export function writeSettings(workspacePath: string, content: string): void {
  // Validate JSON
  JSON.parse(content);
  safeWrite(join(workspacePath, '.claude', 'settings.json'), content);
}

/**
 * All permissions automatically granted to any agent that has canCreateAgents=true.
 * Covers spawning agents + reading and writing templates (required when assigning
 * templates to child agents or saving new template configurations).
 */
export const CREATE_AGENTS_PERMISSIONS: readonly string[] = [
  // agents:create
  'Bash(curl -s -X POST http://localhost:3001/api/agents*)',
  // templates:read
  'Bash(curl -s http://localhost:3001/api/templates*)',
  // templates:write (POST / PUT / PATCH)
  'Bash(curl -s -X POST http://localhost:3001/api/templates*)',
  'Bash(curl -s -X PUT http://localhost:3001/api/templates*)',
  'Bash(curl -s -X PATCH http://localhost:3001/api/templates*)',
] as const;

export function setCreateAgentsPermission(workspacePath: string, enabled: boolean): void {
  const settingsPath = join(workspacePath, '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(raw);
  } catch {
    // file doesn't exist or invalid JSON — start fresh
  }

  const perms = settings.permissions as Record<string, unknown> | undefined ?? {};
  let allow = Array.isArray(perms.allow) ? [...perms.allow as string[]] : [];

  if (enabled) {
    for (const perm of CREATE_AGENTS_PERMISSIONS) {
      if (!allow.includes(perm)) allow.push(perm);
    }
  } else {
    allow = allow.filter((p) => !CREATE_AGENTS_PERMISSIONS.includes(p));
  }

  settings.permissions = { ...perms, allow };
  safeWrite(settingsPath, JSON.stringify(settings, null, 2));
}

export function readPermissions(workspacePath: string): string[] {
  const settingsPath = join(workspacePath, '.claude', 'settings.json');
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const allow = (settings?.permissions?.allow);
    return Array.isArray(allow) ? allow as string[] : [];
  } catch {
    return [];
  }
}

export function writePermissions(workspacePath: string, allow: string[]): void {
  const settingsPath = join(workspacePath, '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch { /* start fresh */ }
  const perms = (settings.permissions as Record<string, unknown> | undefined) ?? {};
  settings.permissions = { ...perms, allow };
  safeWrite(settingsPath, JSON.stringify(settings, null, 2));
}

export function addPermission(workspacePath: string, permission: string): string[] {
  const allow = readPermissions(workspacePath);
  if (!allow.includes(permission)) allow.push(permission);
  writePermissions(workspacePath, allow);
  return allow;
}

export function removePermission(workspacePath: string, permission: string): string[] {
  const allow = readPermissions(workspacePath).filter((p) => p !== permission);
  writePermissions(workspacePath, allow);
  return allow;
}

export function writeCommand(workspacePath: string, name: string, content: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid command name');
  safeWrite(join(workspacePath, '.claude', 'commands', `${name}.md`), content);
}

export function deleteCommand(workspacePath: string, name: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid command name');
  const p = join(workspacePath, '.claude', 'commands', `${name}.md`);
  if (existsSync(p)) {
    unlinkSync(p);
    const parentDir = dirname(p);
    const baseDir = join(workspacePath, '.claude', 'commands');
    if (parentDir !== baseDir) try { rmdirSync(parentDir); } catch { /* not empty */ }
  }
}

export function writeRule(workspacePath: string, name: string, content: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid rule name');
  safeWrite(join(workspacePath, '.claude', 'rules', `${name}.md`), content);
}

export function deleteRule(workspacePath: string, name: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid rule name');
  const p = join(workspacePath, '.claude', 'rules', `${name}.md`);
  if (existsSync(p)) {
    unlinkSync(p);
    const parentDir = dirname(p);
    const baseDir = join(workspacePath, '.claude', 'rules');
    if (parentDir !== baseDir) try { rmdirSync(parentDir); } catch { /* not empty */ }
  }
}

export function writeSkill(workspacePath: string, name: string, content: string): void {
  if (!/^[\w-]+$/.test(name)) throw new Error('Invalid skill name');
  safeWrite(join(workspacePath, '.claude', 'skills', name, 'SKILL.md'), content);
}

/** Recursively copy files from srcDir to destDir (skips if src doesn't exist). */
function copyDir(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry);
    const dest = join(destDir, entry);
    if (statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFileSync(src, dest);
    }
  }
}

/** Copy template workspace files (CLAUDE.md + SOUL.md + OPS.md + TOOLS.md + .claude/) to an agent workspace, replacing .claude/ entirely. */
export function copyWorkspaceFiles(srcPath: string, destPath: string): void {
  if (!existsSync(srcPath)) return;
  mkdirSync(destPath, { recursive: true });
  for (const file of ['CLAUDE.md', 'SOUL.md', 'OPS.md', 'TOOLS.md']) {
    const src = join(srcPath, file);
    if (existsSync(src)) copyFileSync(src, join(destPath, file));
  }
  const claudeDir = join(srcPath, '.claude');
  if (existsSync(claudeDir)) {
    // Replace destination .claude/ entirely so the template is not merged with repo content
    const destClaudeDir = join(destPath, '.claude');
    if (existsSync(destClaudeDir)) rmSync(destClaudeDir, { recursive: true, force: true });
    copyDir(claudeDir, destClaudeDir);
  }
}

/** Copy an agent's workspace files into a template directory, overwriting everything. */
export function snapshotWorkspace(agentPath: string, templatePath: string): void {
  mkdirSync(templatePath, { recursive: true });
  for (const file of ['CLAUDE.md', 'SOUL.md', 'OPS.md', 'TOOLS.md']) {
    const src = join(agentPath, file);
    if (existsSync(src)) copyFileSync(src, join(templatePath, file));
  }
  const claudeDir = join(agentPath, '.claude');
  if (existsSync(claudeDir)) {
    copyDir(claudeDir, join(templatePath, '.claude'));
  }
}

/** Initialize SOUL.md, OPS.md, TOOLS.md for a template workspace (only if absent). */
export function setupTemplateFiles(workspacePath: string, name: string, mission: string): void {
  mkdirSync(workspacePath, { recursive: true });
  const files: Record<string, string> = {
    'SOUL.md':  `# Soul\n\n**Name:** ${name}\n**Mission:** ${mission}\n\nCore principles and identity of this agent.\n`,
    'OPS.md':   `# Operational Playbook\n\nRecurring tasks, conventions, constraints.\n`,
    'TOOLS.md': `# Tools & Environment\n\nAvailable tools, API endpoints, credentials location.\n`,
  };
  for (const [filename, content] of Object.entries(files)) {
    const p = join(workspacePath, filename);
    if (!existsSync(p)) writeFileSync(p, content, 'utf-8');
  }
}

export function setupWorkspaceStructure(workspacePath: string, agentName: string, mission: string): void {
  const today = new Date().toISOString().slice(0, 10);

  // memory/ with daily log and projects/
  mkdirSync(join(workspacePath, 'memory', 'projects'), { recursive: true });
  const dailyLog = join(workspacePath, 'memory', `${today}.md`);
  if (!existsSync(dailyLog)) writeFileSync(dailyLog, `# ${today}\n\n`, 'utf-8');

  // Root files — only created if absent
  const files: Record<string, string> = {
    'SOUL.md':   `# Soul\n\n**Name:** ${agentName}\n**Mission:** ${mission}\n\nCore principles and identity of this agent.\n`,
    'USER.md':   `# User Context\n\nContext about the human operator and their goals.\n`,
    'OPS.md':    `# Operational Playbook\n\nRecurring tasks, conventions, constraints.\n`,
    'MEMORY.md': `# Long-term Memory\n\nCurated key learnings and decisions. Keep this concise and up to date.\n`,
    'TOOLS.md':  `# Tools & Environment\n\nAvailable tools, API endpoints, credentials location.\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    const p = join(workspacePath, name);
    if (!existsSync(p)) writeFileSync(p, content, 'utf-8');
  }
}

export function deleteSkill(workspacePath: string, name: string): void {
  if (!/^[\w-]+$/.test(name)) throw new Error('Invalid skill name');
  const dir = join(workspacePath, '.claude', 'skills', name);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
