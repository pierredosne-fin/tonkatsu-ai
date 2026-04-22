import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { rmSync } from 'fs';

import {
  readWorkspaceFiles,
  writeClaudeMd,
  writeSoul,
  writeOps,
  writeTools,
  copyWorkspaceFiles,
  setupWorkspaceStructure,
} from '../services/fileService.js';

function makeTempDir(): string {
  const dir = join(tmpdir(), `tonkatsu-test-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fileService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── readWorkspaceFiles ────────────────────────────────────────────────────

  describe('readWorkspaceFiles()', () => {
    it('returns null for missing files when workspace is empty', () => {
      const result = readWorkspaceFiles(tmpDir);
      expect(result.claudeMd).toBeNull();
      expect(result.soul).toBeNull();
      expect(result.ops).toBeNull();
      expect(result.tools).toBeNull();
      expect(result.settings).toBeNull();
      expect(result.commands).toEqual([]);
      expect(result.rules).toEqual([]);
      expect(result.skills).toEqual([]);
    });

    it('returns correct content when files exist', () => {
      writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Claude', 'utf-8');
      writeFileSync(join(tmpDir, 'SOUL.md'), '# Soul', 'utf-8');
      writeFileSync(join(tmpDir, 'OPS.md'), '# Ops', 'utf-8');
      writeFileSync(join(tmpDir, 'TOOLS.md'), '# Tools', 'utf-8');
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });
      writeFileSync(join(tmpDir, '.claude', 'settings.json'), '{"theme":"dark"}', 'utf-8');

      const result = readWorkspaceFiles(tmpDir);
      expect(result.claudeMd).toBe('# Claude');
      expect(result.soul).toBe('# Soul');
      expect(result.ops).toBe('# Ops');
      expect(result.tools).toBe('# Tools');
      expect(result.settings).toBe('{"theme":"dark"}');
    });

    it('returns commands from .claude/commands/', () => {
      mkdirSync(join(tmpDir, '.claude', 'commands'), { recursive: true });
      writeFileSync(join(tmpDir, '.claude', 'commands', 'deploy.md'), '# Deploy', 'utf-8');

      const result = readWorkspaceFiles(tmpDir);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe('deploy');
      expect(result.commands[0].content).toBe('# Deploy');
    });

    it('returns skills from .claude/skills/', () => {
      mkdirSync(join(tmpDir, '.claude', 'skills', 'my-skill'), { recursive: true });
      writeFileSync(join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# Skill', 'utf-8');

      const result = readWorkspaceFiles(tmpDir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('my-skill');
      expect(result.skills[0].content).toBe('# Skill');
    });

    it('has the correct shape', () => {
      const result = readWorkspaceFiles(tmpDir);
      expect(result).toHaveProperty('claudeMd');
      expect(result).toHaveProperty('soul');
      expect(result).toHaveProperty('ops');
      expect(result).toHaveProperty('tools');
      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('commands');
      expect(result).toHaveProperty('rules');
      expect(result).toHaveProperty('skills');
    });
  });

  // ── writeClaudeMd / writeSoul / writeOps / writeTools ─────────────────────

  describe('writeClaudeMd()', () => {
    it('writes CLAUDE.md at the correct path', () => {
      writeClaudeMd(tmpDir, '# Hello Claude');
      const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toBe('# Hello Claude');
    });

    it('creates parent directories if missing', () => {
      const nested = join(tmpDir, 'nested', 'workspace');
      writeClaudeMd(nested, '# Nested');
      expect(existsSync(join(nested, 'CLAUDE.md'))).toBe(true);
      rmSync(nested, { recursive: true, force: true });
    });
  });

  describe('writeSoul()', () => {
    it('writes SOUL.md at the correct path', () => {
      writeSoul(tmpDir, '# Soul content');
      const content = readFileSync(join(tmpDir, 'SOUL.md'), 'utf-8');
      expect(content).toBe('# Soul content');
    });
  });

  describe('writeOps()', () => {
    it('writes OPS.md at the correct path', () => {
      writeOps(tmpDir, '# Ops content');
      const content = readFileSync(join(tmpDir, 'OPS.md'), 'utf-8');
      expect(content).toBe('# Ops content');
    });
  });

  describe('writeTools()', () => {
    it('writes TOOLS.md at the correct path', () => {
      writeTools(tmpDir, '# Tools content');
      const content = readFileSync(join(tmpDir, 'TOOLS.md'), 'utf-8');
      expect(content).toBe('# Tools content');
    });
  });

  // ── copyWorkspaceFiles ────────────────────────────────────────────────────

  describe('copyWorkspaceFiles()', () => {
    it('copies CLAUDE.md, SOUL.md, OPS.md, TOOLS.md from src to dest', () => {
      const src = makeTempDir();
      const dest = makeTempDir();
      try {
        writeFileSync(join(src, 'CLAUDE.md'), '# Claude src', 'utf-8');
        writeFileSync(join(src, 'SOUL.md'), '# Soul src', 'utf-8');
        writeFileSync(join(src, 'OPS.md'), '# Ops src', 'utf-8');
        writeFileSync(join(src, 'TOOLS.md'), '# Tools src', 'utf-8');

        copyWorkspaceFiles(src, dest);

        expect(readFileSync(join(dest, 'CLAUDE.md'), 'utf-8')).toBe('# Claude src');
        expect(readFileSync(join(dest, 'SOUL.md'), 'utf-8')).toBe('# Soul src');
        expect(readFileSync(join(dest, 'OPS.md'), 'utf-8')).toBe('# Ops src');
        expect(readFileSync(join(dest, 'TOOLS.md'), 'utf-8')).toBe('# Tools src');
      } finally {
        rmSync(src, { recursive: true, force: true });
        rmSync(dest, { recursive: true, force: true });
      }
    });

    it('copies .claude/ directory recursively', () => {
      const src = makeTempDir();
      const dest = makeTempDir();
      try {
        mkdirSync(join(src, '.claude', 'commands'), { recursive: true });
        writeFileSync(join(src, '.claude', 'commands', 'deploy.md'), '# Deploy', 'utf-8');
        writeFileSync(join(src, '.claude', 'settings.json'), '{}', 'utf-8');

        copyWorkspaceFiles(src, dest);

        expect(existsSync(join(dest, '.claude', 'settings.json'))).toBe(true);
        expect(existsSync(join(dest, '.claude', 'commands', 'deploy.md'))).toBe(true);
        expect(readFileSync(join(dest, '.claude', 'commands', 'deploy.md'), 'utf-8')).toBe('# Deploy');
      } finally {
        rmSync(src, { recursive: true, force: true });
        rmSync(dest, { recursive: true, force: true });
      }
    });

    it('replaces existing .claude/ in dest', () => {
      const src = makeTempDir();
      const dest = makeTempDir();
      try {
        mkdirSync(join(src, '.claude'), { recursive: true });
        writeFileSync(join(src, '.claude', 'settings.json'), '{"new":true}', 'utf-8');

        // Pre-populate dest .claude with old content
        mkdirSync(join(dest, '.claude'), { recursive: true });
        writeFileSync(join(dest, '.claude', 'settings.json'), '{"old":true}', 'utf-8');
        writeFileSync(join(dest, '.claude', 'stale.json'), 'stale', 'utf-8');

        copyWorkspaceFiles(src, dest);

        const settings = readFileSync(join(dest, '.claude', 'settings.json'), 'utf-8');
        expect(JSON.parse(settings)).toEqual({ new: true });
        // Stale file should be gone (dest .claude/ was replaced)
        expect(existsSync(join(dest, '.claude', 'stale.json'))).toBe(false);
      } finally {
        rmSync(src, { recursive: true, force: true });
        rmSync(dest, { recursive: true, force: true });
      }
    });

    it('does nothing when src does not exist', () => {
      const dest = makeTempDir();
      try {
        copyWorkspaceFiles('/nonexistent/path', dest);
        // dest should remain empty (no files copied)
        expect(existsSync(join(dest, 'CLAUDE.md'))).toBe(false);
      } finally {
        rmSync(dest, { recursive: true, force: true });
      }
    });
  });

  // ── setupWorkspaceStructure ───────────────────────────────────────────────

  describe('setupWorkspaceStructure()', () => {
    it('creates expected files', () => {
      setupWorkspaceStructure(tmpDir, 'TestAgent', 'Test the system');

      expect(existsSync(join(tmpDir, 'SOUL.md'))).toBe(true);
      expect(existsSync(join(tmpDir, 'OPS.md'))).toBe(true);
      expect(existsSync(join(tmpDir, 'TOOLS.md'))).toBe(true);
      expect(existsSync(join(tmpDir, 'USER.md'))).toBe(true);
      expect(existsSync(join(tmpDir, 'MEMORY.md'))).toBe(true);
    });

    it('creates memory/ directory and daily log', () => {
      setupWorkspaceStructure(tmpDir, 'TestAgent', 'Test mission');

      expect(existsSync(join(tmpDir, 'memory'))).toBe(true);
      expect(existsSync(join(tmpDir, 'memory', 'projects'))).toBe(true);
      // Daily log should exist with today's date
      const today = new Date().toISOString().slice(0, 10);
      expect(existsSync(join(tmpDir, 'memory', `${today}.md`))).toBe(true);
    });

    it('embeds agent name and mission in SOUL.md', () => {
      setupWorkspaceStructure(tmpDir, 'MyAgent', 'Automate everything');
      const soul = readFileSync(join(tmpDir, 'SOUL.md'), 'utf-8');
      expect(soul).toContain('MyAgent');
      expect(soul).toContain('Automate everything');
    });

    it('does not overwrite existing files', () => {
      writeFileSync(join(tmpDir, 'SOUL.md'), '# Original Soul', 'utf-8');
      setupWorkspaceStructure(tmpDir, 'TestAgent', 'Mission');
      const soul = readFileSync(join(tmpDir, 'SOUL.md'), 'utf-8');
      expect(soul).toBe('# Original Soul');
    });
  });
});
