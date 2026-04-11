import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync, rmdirSync, statSync, copyFileSync } from 'fs';
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
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const skillMd = join(full, 'SKILL.md');
      if (existsSync(skillMd)) {
        results.push({ name: entry, content: readFileSync(skillMd, 'utf-8') });
      }
    }
    // Skip .skill zip files (binary)
  }
  return results;
}

export interface WorkspaceFiles {
  claudeMd: string | null;
  settings: string | null;
  commands: { name: string; content: string }[];
  rules: { name: string; content: string }[];
  skills: { name: string; content: string }[];
}

export function readWorkspaceFiles(workspacePath: string): WorkspaceFiles {
  return {
    claudeMd: safeRead(join(workspacePath, 'CLAUDE.md')),
    settings: safeRead(join(workspacePath, '.claude', 'settings.json')),
    commands: listMdFiles(join(workspacePath, '.claude', 'commands')),
    rules: listMdFiles(join(workspacePath, '.claude', 'rules')),
    skills: listSkills(join(workspacePath, '.claude', 'skills')),
  };
}

export function writeClaudeMd(workspacePath: string, content: string): void {
  safeWrite(join(workspacePath, 'CLAUDE.md'), content);
}

export function writeSettings(workspacePath: string, content: string): void {
  // Validate JSON
  JSON.parse(content);
  safeWrite(join(workspacePath, '.claude', 'settings.json'), content);
}

const CREATE_AGENTS_PERMISSION = 'Bash(curl -s -X POST http://localhost:3001/api/agents*)';


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
  const allow = Array.isArray(perms.allow) ? [...perms.allow as string[]] : [];

  if (enabled) {
    if (!allow.includes(CREATE_AGENTS_PERMISSION)) {
      allow.push(CREATE_AGENTS_PERMISSION);
    }
  } else {
    const idx = allow.indexOf(CREATE_AGENTS_PERMISSION);
    if (idx !== -1) allow.splice(idx, 1);
  }

  settings.permissions = { ...perms, allow };
  safeWrite(settingsPath, JSON.stringify(settings, null, 2));
}

export function writeCommand(workspacePath: string, name: string, content: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid command name');
  safeWrite(join(workspacePath, '.claude', 'commands', `${name}.md`), content);
}

export function deleteCommand(workspacePath: string, name: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid command name');
  const p = join(workspacePath, '.claude', 'commands', `${name}.md`);
  if (existsSync(p)) unlinkSync(p);
}

export function writeRule(workspacePath: string, name: string, content: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid rule name');
  safeWrite(join(workspacePath, '.claude', 'rules', `${name}.md`), content);
}

export function deleteRule(workspacePath: string, name: string): void {
  if (!/^[\w/-]+$/.test(name)) throw new Error('Invalid rule name');
  const p = join(workspacePath, '.claude', 'rules', `${name}.md`);
  if (existsSync(p)) unlinkSync(p);
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

/** Copy template workspace files (CLAUDE.md + .claude/) to an agent workspace without overwriting existing files. */
export function copyWorkspaceFiles(srcPath: string, destPath: string): void {
  if (!existsSync(srcPath)) return;
  const claudeMd = join(srcPath, 'CLAUDE.md');
  if (existsSync(claudeMd) && !existsSync(join(destPath, 'CLAUDE.md'))) {
    mkdirSync(destPath, { recursive: true });
    copyFileSync(claudeMd, join(destPath, 'CLAUDE.md'));
  }
  const claudeDir = join(srcPath, '.claude');
  if (existsSync(claudeDir)) {
    copyDir(claudeDir, join(destPath, '.claude'));
  }
}

/** Copy an agent's workspace files into a template directory, overwriting everything. */
export function snapshotWorkspace(agentPath: string, templatePath: string): void {
  const claudeMd = join(agentPath, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    mkdirSync(templatePath, { recursive: true });
    copyFileSync(claudeMd, join(templatePath, 'CLAUDE.md'));
  }
  const claudeDir = join(agentPath, '.claude');
  if (existsSync(claudeDir)) {
    copyDir(claudeDir, join(templatePath, '.claude'));
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
  if (!existsSync(dir)) return;
  // Remove SKILL.md then the directory if empty enough
  const skillMd = join(dir, 'SKILL.md');
  if (existsSync(skillMd)) unlinkSync(skillMd);
  try { rmdirSync(dir); } catch { /* not empty, leave it */ }
}
