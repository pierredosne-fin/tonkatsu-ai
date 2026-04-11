import { Router } from 'express';
import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
  unlinkSync, readdirSync, statSync,
} from 'fs';
import { join, normalize, relative } from 'path';
import { WORKSPACES_DIR } from '../services/persistenceService.js';

export function createMemoryRouter(): Router {
  const router = Router();

  function memoryDir(teamId: string) {
    return join(WORKSPACES_DIR, teamId, 'memory');
  }

  // Prevent path traversal
  function safePath(teamId: string, filePath: string): string | null {
    const base = memoryDir(teamId);
    const resolved = normalize(join(base, filePath));
    if (!resolved.startsWith(base + '/') && resolved !== base) return null;
    return resolved;
  }

  // Recursively list files
  function listFiles(dir: string, base: string): string[] {
    if (!existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        results.push(...listFiles(full, base));
      } else {
        results.push(relative(base, full));
      }
    }
    return results;
  }

  // GET /api/memory/:teamId — list all files
  router.get('/:teamId', (req, res) => {
    const dir = memoryDir(req.params.teamId);
    res.json({ files: listFiles(dir, dir) });
  });

  // GET /api/memory/:teamId/* — read a file
  router.get('/:teamId/*', (req, res) => {
    const filePath = (req.params as Record<string, string>)[0];
    const full = safePath(req.params.teamId, filePath);
    if (!full) return res.status(400).json({ error: 'Invalid path' });
    if (!existsSync(full) || statSync(full).isDirectory()) return res.status(404).json({ error: 'Not found' });
    res.type('text/plain').send(readFileSync(full, 'utf-8'));
  });

  // POST /api/memory/:teamId/* — write a file (body = plain text)
  router.post('/:teamId/*', (req, res) => {
    const filePath = (req.params as Record<string, string>)[0];
    const full = safePath(req.params.teamId, filePath);
    if (!full) return res.status(400).json({ error: 'Invalid path' });
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
    res.json({ ok: true, path: filePath });
  });

  // DELETE /api/memory/:teamId/* — delete a file
  router.delete('/:teamId/*', (req, res) => {
    const filePath = (req.params as Record<string, string>)[0];
    const full = safePath(req.params.teamId, filePath);
    if (!full) return res.status(400).json({ error: 'Invalid path' });
    if (!existsSync(full)) return res.status(404).json({ error: 'Not found' });
    unlinkSync(full);
    res.json({ ok: true });
  });

  return router;
}
