import { useState } from 'react';

interface WorkspaceResult {
  path: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onCreateFromWorkspace: (workspace: WorkspaceResult) => void;
}

export function DiscoverModal({ onClose, onCreateFromWorkspace }: Props) {
  const [scanPath, setScanPath] = useState('');
  const [results, setResults] = useState<WorkspaceResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);

    const url = scanPath.trim()
      ? `/api/workspaces/scan?path=${encodeURIComponent(scanPath.trim())}`
      : '/api/workspaces/scan';

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Scan failed');
      } else {
        setResults(data);
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  // Auto-scan on open with default locations
  const handleAutoScan = () => {
    setScanPath('');
    handleScan();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Discover Workspaces</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="discover-hint">
            Scan your filesystem for directories with a <code>CLAUDE.md</code> file and create an agent for any of them.
          </p>

          <form className="scan-input-row" onSubmit={handleScan}>
            <input
              type="text"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              placeholder="Absolute path to scan  (empty = scan ~/dev, ~/projects, ~/code…)"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Scanning…' : 'Scan'}
            </button>
            {results === null && !loading && (
              <button type="button" className="btn btn-ghost" onClick={handleAutoScan} disabled={loading}>
                Auto-detect
              </button>
            )}
          </form>

          {error && <p className="discover-error">{error}</p>}

          {loading && (
            <div className="discover-loading">
              <span className="discover-spinner">⚙️</span> Scanning filesystem…
            </div>
          )}

          {results !== null && !loading && (
            results.length === 0 ? (
              <p className="discover-empty">No <code>CLAUDE.md</code> projects found in that location.</p>
            ) : (
              <>
                <p className="discover-count">{results.length} project{results.length !== 1 ? 's' : ''} found</p>
                <ul className="workspace-result-list">
                  {results.map((r) => (
                    <li key={r.path} className="workspace-result-item">
                      <span className="workspace-result-icon">📁</span>
                      <div className="workspace-result-info">
                        <span className="workspace-result-name">{r.name}</span>
                        <span className="workspace-result-path" title={r.path}>{r.path}</span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onCreateFromWorkspace(r)}
                      >
                        + Agent
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
