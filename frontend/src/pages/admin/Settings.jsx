import { get } from '../../api/client.js';
import { Badge, ErrorBox, PageHeader, Spinner, Table, fmtDateTime, useLoad } from '../../components/ui.jsx';

const Status = ({ ok, yes = 'Configured', no = 'Not configured' }) => <Badge value={ok ? 'active' : 'disabled'}>{ok ? yes : no}</Badge>;
const Row = ({ label, children }) => <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"><span className="text-gray-600">{label}</span><span className="font-medium">{children}</span></div>;

export default function AdminSettings() {
  const s = useLoad(() => get('/admin/settings'));
  const u = useLoad(() => get('/admin/ai-usage'));
  const d = s.data;
  return (
    <>
      <PageHeader title="Settings" subtitle="Read-only view of how this system is configured. Change values in .env and restart." />
      <ErrorBox message={s.error} onRetry={s.reload} />
      {s.loading && !d ? <Spinner /> : d && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card"><div className="mb-1 font-bold text-leaf-900">System</div>
            <Row label="Environment">{d.environment}</Row><Row label="Database"><Status ok={d.database.connected} yes="Connected" no="Down" /></Row><Row label="Redis"><Status ok={d.redis.connected} yes="Connected" no="Down" /></Row><Row label="Frontend URL">{d.frontendUrl}</Row></div>
          <div className="card"><div className="mb-1 font-bold text-leaf-900">AI</div>
            <Row label="API key"><Status ok={d.ai.configured} /></Row><Row label="Provider host">{d.ai.provider}</Row><Row label="Chat model">{d.ai.model}</Row><Row label="Embeddings">{d.ai.embeddingModel}</Row></div>
          <div className="card"><div className="mb-1 font-bold text-leaf-900">Weather</div>
            <Row label="API key"><Status ok={d.weather.configured} /></Row><Row label="Cache time">{Math.round(d.weather.cacheTtlSeconds / 60)} min</Row><Row label="Alert check every">{d.weather.alertJobMinutes} min</Row></div>
        </div>
      )}
      <h2 className="mb-2 mt-6 text-lg font-bold text-leaf-900">AI usage</h2>
      <ErrorBox message={u.error} onRetry={u.reload} />
      {u.loading && !u.data ? <Spinner /> : u.data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Total requests', u.data.summary.total], ['Last 24 hours', u.data.summary.last_24h], ['Failed', u.data.summary.failed], ['Avg response (ms)', u.data.summary.avg_latency_ms]].map(([l, v]) => <div key={l} className="card"><div className="text-2xl font-bold">{v ?? 0}</div><div className="text-sm text-gray-500">{l}</div></div>)}
          </div>
          <Table columns={[{ header: 'Feature', render: (r) => r.kind.replace(/_/g, ' ') }, { header: 'Requests', key: 'count' }, { header: 'Failed', render: (r) => r.failed || 0 }]} rows={u.data.byKind.map((r) => ({ ...r, id: r.kind }))} empty="No AI requests yet" />
          <Table columns={[{ header: 'When', render: (r) => fmtDateTime(r.created_at) }, { header: 'User', render: (r) => r.user_name || '–' }, { header: 'Feature', render: (r) => r.kind.replace(/_/g, ' ') }, { header: 'Result', render: (r) => <Badge value={r.success ? 'active' : 'disabled'}>{r.success ? 'OK' : 'Failed'}</Badge> }, { header: 'Time', render: (r) => `${r.latency_ms ?? '–'} ms` }]} rows={u.data.recent} empty="No recent requests" />
        </div>
      )}
    </>
  );
}
