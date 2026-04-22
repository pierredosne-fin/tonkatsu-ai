import { useToastStore, type Toast } from '../store/toastStore';
import type { AgentStatus } from '../types';

const STATUS_META: Record<AgentStatus, { label: string; icon: string; cls: string }> = {
  working:      { label: 'Working',            icon: '⚙️',  cls: 'toast--working'      },
  pending:      { label: 'Needs input',        icon: '❗',  cls: 'toast--pending'      },
  sleeping:     { label: 'Done',              icon: '💤',  cls: 'toast--sleeping'     },
  delegating:   { label: 'Waiting for agent', icon: '📨',  cls: 'toast--delegating'   },
  broadcasting: { label: 'Broadcasting',      icon: '📡',  cls: 'toast--broadcasting' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const meta = STATUS_META[toast.status];

  return (
    <div className={`toast ${meta.cls}`} onClick={() => dismiss(toast.id)}>
      <div className="toast-avatar" style={{ background: toast.avatarColor }}>
        {toast.agentName?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="toast-body">
        <div className="toast-name">{toast.agentName}</div>
        <div className="toast-status">
          <span className="toast-icon">{meta.icon}</span>
          {toast.customMessage
            ? toast.customMessage
            : toast.status === 'pending' && toast.pendingQuestion
            ? toast.pendingQuestion
            : meta.label}
        </div>
      </div>
    </div>
  );
}

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
