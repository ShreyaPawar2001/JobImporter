
// client/pages/index.js
import { useEffect, useState } from 'react';

const PAGE_SIZE = parseInt(process.env.NEXT_PUBLIC_PAGE_SIZE || '10', 10);

function formatDate(d) {
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export default function Home() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFailures, setSelectedFailures] = useState(null);
  const [error, setError] = useState(null);

  // --- fetch logs (uses proxy at /api/import-logs which forwards to your backend)
  async function fetchLogs(pageNum = 1) {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/import-logs?page=${pageNum}&pageSize=${PAGE_SIZE}`);
      if (!resp.ok) throw new Error(`Failed to fetch logs (${resp.status})`);
      const json = await resp.json();

      // support both shapes: legacy array OR { items, page, pageSize, total }
      const data = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
      const total = json.total ?? (Array.isArray(json) ? json.length : data.length);

      // sort newest first
      data.sort((a, b) => new Date(b.importDateTime) - new Date(a.importDateTime));

      setTotalPages(Math.max(1, Math.ceil((total || data.length) / PAGE_SIZE)));
      setLogs(data);
      setPage(pageNum);
    } catch (err) {
      console.error('fetchLogs error:', err);
      setError(err.message || 'Unknown error');
      setLogs([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  // check backend status on mount (optional)
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(d => console.log('Backend says:', d))
      .catch(() => console.warn('Backend status check failed'));
  }, []);

  useEffect(() => {
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function onRefresh() {
    await fetchLogs(page);
  }

  // trigger import and refresh logs
  async function onTriggerImport() {
    try {
      setLoading(true);
      setError(null);

      // prefer POST; proxy will forward to backend
      let resp = await fetch('/api/trigger-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // empty body - backend falls back to FEEDS
      }).catch(() => null);

      if (!resp) {
        // fallback GET
        resp = await fetch('/api/trigger-import');
      }

      if (!resp.ok) {
        console.warn('trigger returned non-ok', resp.status);
      } else {
        const json = await resp.json();
        console.log('Trigger response:', json);
      }

      // fetch newest logs (page 1) after triggering
      await fetchLogs(1);
      setPage(1);
    } catch (e) {
      console.error('onTriggerImport error', e);
      setError('Trigger failed: ' + (e.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ padding: 20 }}>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 className="h1" style={{ margin: 0 }}>Import History</h2>
          <div className="small" style={{ color: '#6b7280' }}>Shows past import runs. Click a failed count to view details.</div>
        </div>
        <div className="controls">
          <button onClick={onRefresh} disabled={loading} style={{ marginRight: 8 }}>Refresh</button>
          <button onClick={onTriggerImport} disabled={loading}>Trigger Import</button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 12, color: 'crimson' }}>{error}</div>}

      {loading ? <div>Loading...</div> : (
        <>
          <table className="table" role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e6e6e6' }}>
                <th style={{ padding: '12px 8px' }}>fileName</th>
                <th style={{ padding: '12px 8px' }}>importDateTime</th>
                <th style={{ padding: '12px 8px' }}>total</th>
                <th style={{ padding: '12px 8px' }}>new</th>
                <th style={{ padding: '12px 8px' }}>updated</th>
                <th style={{ padding: '12px 8px' }}>failed</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan="6" style={{ padding: 14, color: '#6b7280' }}>No logs found</td></tr>
              )}
              {logs.map((l, idx) => (
                <tr key={l._id ?? idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td title={l.fileName} style={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '12px 8px' }}>{l.fileName}</td>
                  <td style={{ padding: '12px 8px' }}>{formatDate(l.importDateTime)}</td>
                  <td style={{ padding: '12px 8px' }}>{l.totalFetched ?? l.totalImported ?? 0}</td>
                  <td style={{ padding: '12px 8px' }}><span className="badge new">{l.newJobs ?? 0}</span></td>
                  <td style={{ padding: '12px 8px' }}><span className="badge">{l.updatedJobs ?? 0}</span></td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      className={`badge fail`}
                      style={{ cursor: (l.failedJobs && l.failedJobs.length) ? 'pointer' : 'default' }}
                      onClick={() => (l.failedJobs && l.failedJobs.length) ? setSelectedFailures({ fileName: l.fileName || 'run', items: l.failedJobs }) : null}
                    >
                      {(l.failedJobs || []).length}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <div className="small">Page {page} of {totalPages}</div>
            <div className="pagination">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        </>
      )}

      {selectedFailures && (
        <div className="modal" onClick={() => setSelectedFailures(null)} style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)'
        }}>
          <div className="box" onClick={e => e.stopPropagation()} style={{ width: 700, maxHeight: '80vh', overflow: 'auto', background: '#fff', padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Failed Jobs — {selectedFailures.fileName}</h3>
            <div className="small" style={{ marginBottom: 8 }}>Count: {selectedFailures.items.length}</div>
            <div>
              {selectedFailures.items.map((f, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 8, border: '1px solid #f1f5f9', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600 }}>{f.id ?? f.externalId ?? 'unknown'}</div>
                  <div className="small" style={{ marginTop: 6 }}>{f.reason ?? JSON.stringify(f)}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <button onClick={() => setSelectedFailures(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
