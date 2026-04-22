import { execFile } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { AgentStatus } from '../models/types.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../..');
const SLACK_SEND = resolve(REPO_ROOT, 'scripts/slack-send');

const STATUS_LABELS: Record<AgentStatus, string> = {
  working:    '⚙️ Working…',
  pending:    '❗ Needs your input',
  sleeping:   '💤 Done',
  delegating: '📨 Waiting for agent',
};

export function notifyDesktop(agentName: string, status: AgentStatus, pendingQuestion?: string): void {
  const title = `${agentName} — ${STATUS_LABELS[status]}`;
  const rawBody = status === 'pending' && pendingQuestion ? pendingQuestion : STATUS_LABELS[status];
  // Truncate long bodies (pending questions can be very long)
  const body = rawBody.length > 120 ? rawBody.slice(0, 117) + '…' : rawBody;

  // Use execFile to avoid shell escaping issues (no shell interpolation)
  const script = `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "default"`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.warn('[notify] osascript failed:', err.message);
  });
}

export function notifySlack(agentName: string, question: string): void {
  const target = process.env.SLACK_ALLOWED_TARGET;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!target || !token) return;

  const message = `❗ *${agentName}* needs your input:\n${question}`;
  execFile(SLACK_SEND, [target, message], { env: { ...process.env } }, (err) => {
    if (err) console.warn('[notify] slack-send failed:', err.message);
  });
}
