import { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';
import type { ConversationSession } from '../types';

const TOOL_ICONS: Record<string, string> = {
  read_file: '📄',
  write_file: '✏️',
  list_directory: '📁',
  run_command: '⚡',
};

interface Props {
  agentId: string;
  onClose: () => void;
  onDelete: (agentId: string) => void;
}

export function ChatModal({ agentId, onClose, onDelete }: Props) {
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const allAgents = useAgentStore((s) => {
    const current = s.agents.find((a) => a.id === agentId);
    return s.agents.filter((a) => a.id !== agentId && a.teamId === current?.teamId);
  });
  const streamBuffer = useAgentStore((s) => s.streamBuffers.get(agentId) ?? '');
  const toolEvents = useAgentStore((s) => s.toolEvents.get(agentId) ?? []);
  const delegationEvents = useAgentStore((s) => s.delegationEvents.get(agentId) ?? []);
  const toolCallCount = useAgentStore((s) => s.toolCallCounters.get(agentId) ?? 0);
  const history = useAgentStore((s) => s.agentHistories.get(agentId) ?? []);
  const sessions = useAgentStore((s) => s.agentSessions.get(agentId) ?? []);
  const { subscribeToAgent, sendMessage, sleepAgent, newConversation, listSessions, resumeSession } = useSocketStore();

  const [input, setInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed
  const [mentionIndex, setMentionIndex] = useState(0);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeIndex, setResumeIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { subscribeToAgent(agentId); }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamBuffer, toolEvents.length, history.length]);

  if (!agent) return null;

  const isDisabled = agent.status === 'working' || agent.status === 'delegating';

  // Filtered agents for @mention dropdown
  const mentionMatches = mentionQuery === null
    ? []
    : allAgents.filter((a) =>
        a.name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      );

  // ── Input handling ──────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);

    // Detect /resume command
    if (val === '/resume' || val.startsWith('/resume ')) {
      if (!resumeOpen) {
        setResumeOpen(true);
        setResumeIndex(0);
        listSessions(agentId);
      }
      setMentionQuery(null);
      return;
    }
    if (resumeOpen) setResumeOpen(false);

    // Detect @mention: find the last @ that isn't followed by a space
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = /@(\w*)$/.exec(textBeforeCursor);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (resumeOpen && sessions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setResumeIndex((i) => (i + 1) % sessions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setResumeIndex((i) => (i - 1 + sessions.length) % sessions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSession(sessions[resumeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setResumeOpen(false);
        setInput('');
        return;
      }
    }

    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionMatches[mentionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
  }

  function selectSession(session: ConversationSession) {
    setResumeOpen(false);
    setInput('');
    resumeSession(agentId, session.file);
  }

  function insertMention(name: string) {
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    // Replace the partial @query with the full @Name
    const replaced = before.replace(/@(\w*)$/, `@${name} `);
    setInput(replaced + after);
    setMentionQuery(null);
    // Restore focus
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = replaced.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isDisabled) return;
    if (resumeOpen) return; // /resume is handled via keyboard, not submit
    sendMessage(agentId, input.trim());
    setInput('');
    setMentionQuery(null);
  }

  function handleNewConversation() {
    if (isDisabled) return;
    if (!confirm('Start a new conversation? The current one will be archived.')) return;
    newConversation(agentId);
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  function handleDelete() {
    if (confirm(`Delete agent "${agent.name}"?`)) {
      onDelete(agentId);
      onClose();
    }
  }

  function cleanText(text: string) {
    return text
      .replace(/<NEED_INPUT>[\s\S]*?<\/NEED_INPUT>/g, '')
      .replace(/<CALL_AGENT[^>]*>[\s\S]*?<\/CALL_AGENT>/g, '')
      .trim();
  }

  const placeholder = isDisabled
    ? 'Agent is working…'
    : agent.status === 'pending'
    ? 'Type your response…'
    : 'Message, @mention an agent, or /resume a past conversation…';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--chat" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="chat-agent-info">
            <span className="chat-avatar" style={{ backgroundColor: agent.avatarColor }}>
              {agent.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2>{agent.name}</h2>
              <span className={`chat-status chat-status--${agent.status}`}>
                {agent.status === 'sleeping'   ? '💤 Sleeping'
                  : agent.status === 'working'    ? '⚙️ Working…'
                  : agent.status === 'delegating' ? '📨 Waiting for agent'
                  : '❗ Needs your input'}
                {toolCallCount > 0 && (agent.status === 'working' || agent.status === 'delegating') && (
                  <span className="tool-call-counter">{toolCallCount} calls</span>
                )}
              </span>
            </div>
          </div>
          <div className="chat-actions">
            {agent.status === 'working' && (
              <button className="btn btn-ghost btn-sm" onClick={() => sleepAgent(agentId)}>■ Stop</button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleNewConversation}
              disabled={isDisabled}
              title="Start a new conversation (archives current)"
            >
              ✦ New
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="chat-body">
          <div className="chat-mission">
            <strong>Mission:</strong> {agent.mission}
            {agent.workspacePath && (
              <div className="chat-workspace">
                <span>📂</span> <code>{agent.workspacePath}</code>
                {agent.worktreeOf && (
                  <span className="chat-worktree-badge" title={`Worktree of ${agent.worktreeOf}`}> ⑂ worktree</span>
                )}
              </div>
            )}
          </div>

          {history.map((msg, i) => (
            <div key={i} className={`chat-message chat-message--${msg.role}`}>
              <span className="chat-message-label">
                {msg.role === 'user' ? 'You' : agent.name}
              </span>
              <div className="chat-message-content">{cleanText(msg.content)}</div>
            </div>
          ))}

          {streamBuffer && (
            <div className="chat-message chat-message--assistant chat-message--streaming">
              <span className="chat-message-label">{agent.name}</span>
              <div className="chat-message-content">
                {cleanText(streamBuffer)}
                <span className="cursor-blink">▋</span>
              </div>
            </div>
          )}

          {toolEvents.map((ev, i) => (
            <div key={i} className={`chat-tool-event chat-tool-event--${ev.type}`}>
              <span className="chat-tool-icon">{TOOL_ICONS[ev.tool] ?? '🔧'}</span>
              <div className="chat-tool-body">
                <span className="chat-tool-name">
                  {ev.type === 'call' ? ev.tool : `${ev.tool} → result`}
                </span>
                {ev.type === 'call' && ev.input && (
                  <code className="chat-tool-input">
                    {Object.entries(ev.input).map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join(' | ')}
                  </code>
                )}
                {ev.type === 'result' && ev.result && (
                  <code className="chat-tool-result">{ev.result}</code>
                )}
              </div>
            </div>
          ))}

          {delegationEvents.map((ev, i) => (
            <div key={i} className={`chat-delegation chat-delegation--${ev.type}`}>
              <span className="chat-delegation-icon">{ev.type === 'delegating' ? '📨' : '📩'}</span>
              <div className="chat-delegation-body">
                <span className="chat-delegation-label">
                  {ev.type === 'delegating' ? `Calling ${ev.toAgentName}…` : `${ev.toAgentName} replied`}
                </span>
                <div className="chat-delegation-text">
                  {ev.type === 'delegating' ? ev.message : ev.response}
                </div>
              </div>
            </div>
          ))}

          {agent.status === 'pending' && agent.pendingQuestion && (
            <div className="chat-pending-question">
              <strong>❗ {agent.pendingQuestion}</strong>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area + @mention dropdown */}
        <div className="chat-input-wrapper">
          {/* /resume session picker */}
          {resumeOpen && (
            <div className="mention-dropdown">
              {sessions.length === 0 ? (
                <div className="mention-empty">No archived sessions</div>
              ) : (
                sessions.map((s, i) => (
                  <button
                    key={s.file}
                    className={`mention-item ${i === resumeIndex ? 'mention-item--active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); selectSession(s); }}
                  >
                    <span className="mention-name">{s.label}</span>
                    <span className="mention-status" style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                      {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* @mention dropdown */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="mention-dropdown">
              {mentionMatches.map((a, i) => (
                <button
                  key={a.id}
                  className={`mention-item ${i === mentionIndex ? 'mention-item--active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(a.name); }}
                >
                  <span
                    className="mention-dot"
                    style={{ backgroundColor: a.avatarColor }}
                  />
                  <span className="mention-name">{a.name}</span>
                  <span className={`mention-status mention-status--${a.status}`}>
                    {a.status === 'sleeping' ? '💤' : a.status === 'working' ? '⚙️' : a.status === 'delegating' ? '📨' : '❗'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {mentionQuery !== null && allAgents.length === 0 && (
            <div className="mention-dropdown">
              <div className="mention-empty">No other agents</div>
            </div>
          )}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              autoFocus={agent.status === 'pending'}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isDisabled || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
