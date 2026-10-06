import { useState } from 'react';
import { errorMessage, get, post } from '../../api/client.js';
import { Empty, ErrorBox, PageHeader, Spinner, Table, fmtDateTime, useLoad } from '../../components/ui.jsx';

export default function AdminAlerts() {
  const { data, loading, error, reload } = useLoad(() => get('/admin/weather-alerts'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr(''); setMsg('');
    try { await post('/admin/weather-alerts/run', {}, { timeout: 120000 }).then(() => get('/admin/weather-alerts')); setMsg('Alert check finished.'); reload(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const rows = data ? data.alerts : [];
  const cols = [
    { header: 'Farmer', render: (a) => <b>{a.farmer_name}</b> },
    { header: 'Location', render: (a) => [a.district, a.state].filter(Boolean).join(', ') || '–' },
    { header: 'Alert', render: (a) => <div><div className="font-semibold">{a.title}</div><div className="text-xs text-gray-500">{a.body}</div></div> },
    { header: 'Sent', render: (a) => fmtDateTime(a.created_at) },
  ];
  return (
    <>
      <PageHeader title="Weather alerts" subtitle={data ? `Farmers are checked every ${data.jobEveryMinutes} minutes. Each farmer gets at most one alert per kind per day.` : undefined}
        actions={<button className="btn-primary" onClick={run} disabled={busy}>{busy ? 'Checking…' : 'Run check now'}</button>} />
      {data && !data.weatherConfigured && <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">WEATHER_API_KEY is not set, so weather lookups and alerts are unavailable. Add a key to .env and restart the backend.</div>}
      <ErrorBox message={error || err} onRetry={reload} />
      {msg && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{msg}</div>}
      {loading && !data ? <Spinner /> : rows.length === 0 && !error ? <Empty icon="⛅" title="No weather alerts sent yet" hint="Alerts are created when the forecast shows heavy rain, heat, frost or strong wind." /> : <Table columns={cols} rows={rows} />}
    </>
  );
}
