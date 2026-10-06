import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../../api/client.js';
import WeatherCard from '../../components/WeatherCard.jsx';
import { Badge, Empty, ErrorBox, Modal, PageHeader, Spinner, Table, fmtDate, useLoad } from '../../components/ui.jsx';

function FarmerDetail({ id, onClose }) {
  const { data, loading, error, reload } = useLoad(() => get(`/farmers/${id}`), [id]);
  const p = data && data.profile;
  return (
    <Modal title={p ? p.name : 'Farmer'} onClose={onClose} wide>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : p && (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-gray-500">Mobile:</span> {p.mobile || '–'}</div>
            <div><span className="text-gray-500">Email:</span> {p.email}</div>
            <div><span className="text-gray-500">Location:</span> {[p.village, p.district, p.state, p.country].filter(Boolean).join(', ') || '–'}</div>
            <div><span className="text-gray-500">Farm size:</span> {p.farm_size ? `${p.farm_size} ${p.farm_size_unit}` : '–'}</div>
            <div><span className="text-gray-500">Soil:</span> {p.soil_type || '–'}</div>
            <div><span className="text-gray-500">Irrigation:</span> {p.irrigation_type || '–'}</div>
          </div>
          <div>
            <div className="mb-1 font-semibold">Crops</div>
            {data.crops.length === 0 ? <p className="text-sm text-gray-500">No crops added.</p> : (
              <ul className="divide-y rounded-lg border text-sm">{data.crops.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 p-2"><b>{c.crop_name}{c.variety ? ` (${c.variety})` : ''}</b><span className="text-gray-500">Sown {fmtDate(c.sowing_date)} · Harvest {fmtDate(c.expected_harvest_date)}</span></li>
              ))}</ul>
            )}
          </div>
          <div>
            <div className="mb-1 font-semibold">Recent tickets</div>
            {data.tickets.length === 0 ? <p className="text-sm text-gray-500">No tickets.</p> : (
              <ul className="divide-y rounded-lg border text-sm">{data.tickets.map((t) => <li key={t.id} className="flex items-center justify-between gap-2 p-2"><span>#{t.id} {t.subject}</span><span className="flex gap-1"><Badge value={t.priority} /><Badge value={t.status} /></span></li>)}</ul>
            )}
          </div>
          <WeatherCard path={`/weather/farmer/${id}`} compact title="Farm location" />
        </div>
      )}
    </Modal>
  );
}

export default function AgentFarmers() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, loading, error, reload } = useLoad(() => get(`/farmers${search ? `?search=${encodeURIComponent(search)}` : ''}`), [search]);
  const rows = data ? data.farmers : [];
  const cols = [
    { header: 'Farmer', render: (f) => <button className="font-semibold text-leaf-800 hover:underline" onClick={() => setOpenId(f.id)}>{f.name}</button> },
    { header: 'Location', render: (f) => [f.village, f.district, f.state].filter(Boolean).join(', ') || '–' },
    { header: 'Crops', render: (f) => f.crops || '–' },
    { header: 'Current issue', render: (f) => f.current_issue || <span className="text-gray-400">None</span> },
    { header: 'Priority', render: (f) => (f.current_priority ? <Badge value={f.current_priority} /> : '–') },
    { header: '', render: (f) => <Link className="btn-primary btn-sm" to="/agent/chat" state={{ conversationId: f.conversation_id }}>💬 Chat</Link> },
  ];
  return (
    <>
      <PageHeader title="My farmers" subtitle="Farmers assigned to you." actions={<input className="input w-56" placeholder="Search name, email, district" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search farmers" />} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : rows.length === 0 && !error ? <Empty icon="🧑‍🌾" title="No farmers found" hint="An admin assigns farmers to you. They will appear here." /> : <Table columns={cols} rows={rows} />}
      {openId && <FarmerDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
