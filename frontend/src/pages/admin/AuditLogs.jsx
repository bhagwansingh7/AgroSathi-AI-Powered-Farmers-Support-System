import { useState } from 'react';
import { get } from '../../api/client.js';
import { Badge, Empty, ErrorBox, PageHeader, Spinner, Table, fmtDateTime, useLoad } from '../../components/ui.jsx';

const describe = (m) => (m && Object.keys(m).length ? Object.entries(m).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '');

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, loading, error, reload } = useLoad(() => get(`/admin/audit-logs?page=${page}&limit=25${action ? `&action=${encodeURIComponent(action)}` : ''}`), [page, action]);
  const rows = data ? data.logs : [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const cols = [
    { header: 'When', render: (l) => fmtDateTime(l.created_at) },
    { header: 'Actor', render: (l) => (l.actor_name ? <span><b>{l.actor_name}</b> <Badge>{l.actor_role}</Badge></span> : 'System') },
    { header: 'Action', render: (l) => <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{l.action}</code> },
    { header: 'Target', render: (l) => (l.target_type ? `${l.target_type}${l.target_id ? ` #${l.target_id}` : ''}` : '–') },
    { header: 'Details', render: (l) => <span className="text-xs text-gray-600">{describe(l.metadata)}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit logs" subtitle="Who did what, and when."
        actions={<select className="input w-auto" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} aria-label="Filter by action"><option value="">All actions</option>{['user', 'assignment', 'ticket', 'knowledge', 'crop_category', 'location', 'weather_alerts'].map((a) => <option key={a} value={a}>{a}</option>)}</select>} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : rows.length === 0 && !error ? <Empty icon="🧾" title="No audit entries" /> : <Table columns={cols} rows={rows} />}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-500">{data ? `${data.total} entries` : ''}</span>
        <div className="flex items-center gap-2"><button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
      </div>
    </>
  );
}
