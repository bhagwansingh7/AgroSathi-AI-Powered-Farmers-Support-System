import { Link } from 'react-router-dom';
import { get } from '../../api/client.js';
import WeatherCard from '../../components/WeatherCard.jsx';
import { Badge, Empty, ErrorBox, PageHeader, Spinner, StatCard, Table, useLoad } from '../../components/ui.jsx';
import { useState } from 'react';
import { Modal } from '../../components/ui.jsx';

export default function AgentDashboard() {
  const { data, loading, error, reload } = useLoad(() => get('/agents/me/dashboard'));
  const [weatherFor, setWeatherFor] = useState(null);
  if (loading && !data) return <Spinner />;
  const c = data ? data.counts : {};
  const rows = data ? data.priorityTickets : [];
  const cols = [
    { header: 'Farmer', render: (t) => <b>{t.farmer_name}</b> },
    { header: 'Crop', render: (t) => t.crop_name || '–' },
    { header: 'Location', render: (t) => [t.village, t.district, t.state].filter(Boolean).join(', ') || '–' },
    { header: 'Current issue', key: 'subject' },
    { header: 'Priority', render: (t) => <Badge value={t.priority} /> },
    { header: 'Status', render: (t) => <Badge value={t.status} /> },
    { header: '', render: (t) => (
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" onClick={() => setWeatherFor(t)}>⛅ Weather</button>
        <Link className="btn-primary btn-sm" to="/agent/chat" state={{ conversationId: t.conversation_id }}>💬 Chat</Link>
      </div>
    ) },
  ];
  return (
    <>
      <PageHeader title="Agent dashboard" subtitle="Your farmers, tickets and conversations at a glance." />
      <ErrorBox message={error} onRetry={reload} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="My farmers" value={c.farmers} icon="🧑‍🌾" />
        <StatCard label="My tickets" value={c.my_tickets} icon="🎫" tone="blue" />
        <StatCard label="Pending requests" value={c.pending_requests} icon="⏳" tone="amber" />
        <StatCard label="Unread conversations" value={c.active_conversations} icon="💬" tone="red" />
        <StatCard label="Resolved tickets" value={c.resolved_tickets} icon="✅" />
      </div>
      <h2 className="mb-2 text-lg font-bold text-leaf-900">Needs attention</h2>
      {rows.length === 0 && !error ? <Empty icon="🎉" title="Nothing waiting" hint="New tickets from your farmers will show up here." /> : <Table columns={cols} rows={rows} />}
      {weatherFor && (
        <Modal title={`Weather for ${weatherFor.farmer_name}`} onClose={() => setWeatherFor(null)} wide>
          <WeatherCard path={`/weather/farmer/${weatherFor.farmer_id}`} title="Farm location" />
        </Modal>
      )}
    </>
  );
}
