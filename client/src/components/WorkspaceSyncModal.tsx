import { useState, useEffect } from 'react';
import type { WorkspaceSyncConfig } from '../types';

interface Props {
  onClose: () => void;
}

export function WorkspaceSyncModal({ onClose }: Props) {
  const [config, setConfig] = useState<WorkspaceSyncConfig | null>(null);
  const [sshKeyConfigured, setSshKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  const [remoteUrl, setRemoteUrl] = useState('');
  const [branch, setBranch] = useState('main');

  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyContent, setKeyContent] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingSSH, setTestingSSH] = useState(false);
  const [sshTestResult, setSshTestResult] = useState<{ ok: boolean; output: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/workspace-sync')
      .then((r) => r.json())
      .then(({ config: cfg, sshKeyConfigured: hasKey }: { config: WorkspaceSyncConfig | null; sshKeyConfigured: boolean }) => {
        setSshKeyConfigured(hasKey ?? false);
        if (cfg) {
          setConfig(cfg);
          setRemoteUrl(cfg.remoteUrl ?? '');
          setBranch(cfg.branch ?? 'main');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveKey = async () => {
    if (!keyContent.trim()) return;
    setSavingKey(true);
    setKeyError('');
    const res = await fetch('/api/ssh-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: keyContent }),
    });
    setSavingKey(false);
    if (res.ok) {
      setSshKeyConfigured(true);
      setShowKeyForm(false);
      setKeyContent('');
    } else {
      const data = await res.json();
      setKeyError(data.error ?? 'Invalid key');
    }
  };

  const handleDeleteKey = async () => {
    await fetch('/api/ssh-keys', { method: 'DELETE' });
    setSshKeyConfigured(false);
    setSshTestResult(null);
  };

  const handleSave = async () => {
    if (!remoteUrl.trim()) return;
    setSaving(true);
    setError('');
    const res = await fetch('/api/workspace-sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteUrl: remoteUrl.trim(), branch: branch.trim() || 'main' }),
    });
    setSaving(false);
    if (res.ok) {
      setConfig({ remoteUrl: remoteUrl.trim(), branch: branch.trim() || 'main' });
    } else {
      setError('Failed to save config');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    const res = await fetch('/api/workspace-sync/trigger', { method: 'POST' });
    const data = await res.json();
    setSyncing(false);
    if (res.ok) {
      setConfig((prev) => prev ? { ...prev, lastSyncAt: data.syncedAt, lastSyncStatus: 'ok', lastSyncError: undefined } : prev);
    } else {
      setError(data.error ?? 'Sync failed');
      setConfig((prev) => prev ? { ...prev, lastSyncStatus: 'error', lastSyncError: data.error } : prev);
    }
  };

  const handleTestSSH = async () => {
    setTestingSSH(true);
    setSshTestResult(null);
    const res = await fetch('/api/workspace-sync/test-ssh', { method: 'POST' });
    const data = await res.json();
    setTestingSSH(false);
    setSshTestResult({ ok: data.ok, output: data.output });
  };

  const isConfigured = !!(config?.remoteUrl);
  const hasUnsavedChanges = !config || remoteUrl.trim() !== (config.remoteUrl ?? '') || (branch.trim() || 'main') !== (config.branch ?? 'main');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? <div className="file-loading">Loading…</div> : (
            <>
              {/* ── SSH Key ── */}
              <div className="form-group">
                <div className="form-label-row">
                  <label>SSH Key</label>
                  {sshKeyConfigured && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={testingSSH} onClick={handleTestSSH}>
                        {testingSSH ? 'Testing…' : '🔑 Test'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowKeyForm((v) => !v); setKeyError(''); }}>
                        {showKeyForm ? 'Cancel' : 'Replace'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--text-dim)' }} onClick={handleDeleteKey}>
                        Remove
                      </button>
                    </div>
                  )}
                  {!sshKeyConfigured && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowKeyForm((v) => !v); setKeyError(''); }}>
                      {showKeyForm ? 'Cancel' : '+ Add key'}
                    </button>
                  )}
                </div>
                {sshKeyConfigured && !showKeyForm && (
                  <div className="form-hint-block" style={{ color: '#10b981' }}>✓ SSH key configured — used for workspace sync and all agent git repos.</div>
                )}
                {!sshKeyConfigured && !showKeyForm && (
                  <div className="form-hint">No SSH key. Required for private repos.</div>
                )}
                {showKeyForm && (
                  <div className="ssh-key-form" style={{ marginTop: 8 }}>
                    <textarea
                      value={keyContent}
                      onChange={(e) => setKeyContent(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;…&#10;-----END OPENSSH PRIVATE KEY-----"
                      rows={6}
                      spellCheck={false}
                      className="ssh-key-textarea"
                    />
                    {keyError && <div className="file-error">{keyError}</div>}
                    <button type="button" className="btn btn-primary btn-sm"
                      disabled={savingKey || !keyContent.trim()} onClick={handleSaveKey}>
                      {savingKey ? 'Saving…' : 'Save key'}
                    </button>
                  </div>
                )}
                {sshTestResult && (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', background: 'var(--surface)', border: `1px solid ${sshTestResult.ok ? '#10b981' : '#ef4444'}`, color: sshTestResult.ok ? '#10b981' : '#ef4444' }}>
                    {sshTestResult.ok ? '✓ ' : '✗ '}{sshTestResult.output}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

              {/* ── Workspace Sync ── */}
              <p className="form-hint" style={{ marginBottom: 16 }}>
                Links <code>workspaces/</code> to a remote git repo. On first sync the repo is cloned into <code>repos/</code> and <code>workspaces/</code> becomes a symlink to it. Subsequent syncs run <code>git pull</code>. UI edits write directly into the repo — commit &amp; push manually when ready.
              </p>
              <div className="form-group">
                <label htmlFor="ws-remote-url">Remote URL</label>
                <input id="ws-remote-url" type="text" value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="git@github.com:org/my-team-workspaces.git"
                  spellCheck={false} />
              </div>
              <div className="form-group">
                <label htmlFor="ws-branch">Branch</label>
                <input id="ws-branch" type="text" value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main" spellCheck={false} style={{ maxWidth: 200 }} />
              </div>

              {config?.lastSyncAt && (
                <div className="form-hint-block" style={{ marginTop: 8 }}>
                  Last sync: {new Date(config.lastSyncAt).toLocaleString()}{' '}
                  {config.lastSyncStatus === 'ok'
                    ? <span style={{ color: '#10b981' }}>✓ ok</span>
                    : <span style={{ color: '#ef4444' }}>✗ {config.lastSyncError ?? 'error'}</span>}
                </div>
              )}

              {error && <div className="file-error" style={{ marginTop: 8 }}>{error}</div>}
            </>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost"
            disabled={syncing || !isConfigured || hasUnsavedChanges}
            onClick={handleSync}
            title={hasUnsavedChanges ? 'Save config first' : !isConfigured ? 'Configure a source first' : ''}>
            {syncing ? 'Syncing…' : '↓ Sync Now'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary"
              disabled={saving || !remoteUrl.trim()} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
