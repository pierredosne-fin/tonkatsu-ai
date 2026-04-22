import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const AUDIT_DIR = join(process.cwd(), 'workspaces', '.audit');

try { mkdirSync(AUDIT_DIR, { recursive: true }); } catch { /* ignore */ }

export interface AuditEntry {
  timestamp: string;
  event: 'room:zoom-in' | 'agent:zoom-in';
  userId: string;
  resourceType: 'room' | 'agent';
  resourceId: string;
  teamId?: string;
  allowed: boolean;
  ip?: string;
}

export function writeAuditLog(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + '\n';
  const date = entry.timestamp.slice(0, 10);
  const file = join(AUDIT_DIR, `${date}.jsonl`);
  try {
    appendFileSync(file, line, 'utf8');
  } catch (err) {
    console.error('[audit] failed to write log:', err);
  }
  console.log(
    `[audit] ${entry.event} user=${entry.userId} ${entry.resourceType}=${entry.resourceId} allowed=${entry.allowed}`,
  );
}
