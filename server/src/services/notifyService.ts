import { execFile } from 'child_process';
import type { AgentStatus } from '../models/types.js';
import { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, APP_URL } from '../config.js';

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

export function notifySlack(agentName: string, agentId: string, question: string): void {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) return;

  const deepLink = `${APP_URL}/#/agents/${agentId}`;
  const payload = {
    channel: SLACK_CHANNEL_ID,
    text: `*${agentName}* needs your input`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${agentName}* — ❗ Needs your input\n\n${question}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open chat' },
            url: deepLink,
          },
        ],
      },
    ],
  };

  fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((body: unknown) => {
      if (typeof body === 'object' && body !== null && !(body as { ok: boolean }).ok) {
        console.warn('[notify] Slack postMessage error:', (body as { error?: string }).error);
      }
    })
    .catch((err: unknown) => {
      console.warn('[notify] Slack postMessage failed:', err instanceof Error ? err.message : String(err));
    });
}
