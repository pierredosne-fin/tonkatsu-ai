import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { useAgentStore } from '../store/agentStore';
import { useSocketStore } from '../store/socketStore';

interface Props {
  agentId: string;
  rect: DOMRect;
  onOpenFull: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function cleanText(text: string) {
  return text
    .replace(/<NEED_INPUT>[\s\S]*?<\/NEED_INPUT>/g, '')
    .replace(/<CALL_AGENT[^>]*>[\s\S]*?<\/CALL_AGENT>/g, '')
    .trim();
}

export function ChatPeek({ agentId, rect, onOpenFull, onMouseEnter, onMouseLeave }: Props) {
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const streamBuffer = useAgentStore((s) => s.streamBuffers.get(agentId) ?? '');
  const history = useAgentStore((s) => s.agentHistories.get(agentId) ?? []);
  const { subscribeToAgent, sendMessage } = useSocketStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { subscribeToAgent(agentId); }, [agentId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamBuffer, history.length]);

  if (!agent) return null;

  const isDisabled = agent.status === 'working' || agent.status === 'delegating';

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isDisabled) return;
    sendMessage(agentId, msg);
    setInput('');
  };

  // Position: right of room if room is in the left half of the screen, else left
  const PEEK_W = 320;
  const PEEK_H = 460;
  const showRight = rect.right + PEEK_W + 12 < window.innerWidth;
  const top = Math.min(rect.top, window.innerHeight - PEEK_H - 12);
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(8, top),
    width: PEEK_W,
    zIndex: 400,
    ...(showRight
      ? { left: rect.right + 10 }
      : { left: rect.left - PEEK_W - 10 }),
  };

  return createPortal(
    <div
      className="chat-peek"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="chat-peek-header">
        <div className="chat-agent-info">
          <span className="chat-avatar chat-peek-avatar" style={{ backgroundColor: agent.avatarColor }}>
            {agent.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="chat-peek-name">{agent.name}</div>
            <span className={`chat-status chat-status--${agent.status} chat-peek-status`}>
              {agent.status === 'sleeping'   ? '💤 Sleeping'
                : agent.status === 'working'    ? '⚙️ Working…'
                : agent.status === 'delegating' ? '📨 Waiting for agent'
                : '❗ Needs your input'}
            </span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm chat-peek-expand" onClick={onOpenFull} title="Open full chat">
          ⤢
        </button>
      </div>

      {/* Body */}
      <div className="chat-peek-body">
        {history.length === 0 && !streamBuffer && (
          <div className="chat-peek-empty">No messages yet</div>
        )}
        {history.map((msg, i) => {
          const text = cleanText(msg.content);
          if (!text) return null;
          return (
            <div key={i} className={`chat-message chat-message--${msg.role}`}>
              <span className="chat-message-label">{msg.role === 'user' ? 'You' : agent.name}</span>
              <div className="chat-message-content chat-message-content--md">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            </div>
          );
        })}
        {streamBuffer && (
          <div className="chat-message chat-message--assistant">
            <span className="chat-message-label">{agent.name}</span>
            <div className="chat-message-content">{cleanText(streamBuffer)}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-peek-footer">
        <input
          className="chat-peek-input"
          placeholder={
            isDisabled ? 'Agent is working…'
            : agent.status === 'pending' ? 'Type your response…'
            : 'Message…'
          }
          disabled={isDisabled}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
