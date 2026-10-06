import { Link } from 'react-router-dom';
import { get } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import WeatherCard from '../../components/WeatherCard.jsx';
import { Badge, Empty, ErrorBox, Spinner, fmtDate, useLoad } from '../../components/ui.jsx';

export default function FarmerDashboard() {
  const { user } = useAuth();
  const { data: d, loading, error, reload } = useLoad(() => get('/farmers/me/dashboard'));
  if (loading && !d) return <Spinner />;
  return (
    <div className="space-y-5">
      <div><h1 className="text-3xl font-bold text-leaf-900">Namaste, {user.name.split(' ')[0]} 🙏</h1><p className="text-gray-600">Here is what is happening on your farm today.</p></div>
      <ErrorBox message={error} onRetry={reload} />
      {d && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><WeatherCard path="/weather/me" compact title="Weather at your farm" /></div>
            <div className="card space-y-2">
              <div className="font-bold text-leaf-900">👨‍💼 My agent</div>
              {d.agent ? (
                <>
                  <div className="text-lg font-semibold">{d.agent.name}</div>
                  <div className="text-sm text-gray-600">Specialization: {d.agent.specialization || 'General'}</div>
                  <div className="text-sm">Status: <Badge value={d.agent.active ? 'active' : 'disabled'}>{d.agent.active ? 'Active' : 'Unavailable'}</Badge></div>
                  <Link className="btn-primary w-full" to="/farmer/chat">💬 Chat with {d.agent.name.split(' ')[0]}{d.conversation && d.conversation.unread > 0 ? ` (${d.conversation.unread} new)` : ''}</Link>
                </>
              ) : (<><p className="text-sm text-gray-600">No agent assigned yet. Create a support request and an admin will assign one.</p><Link className="btn-primary w-full" to="/farmer/tickets">Create support request</Link></>)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Link to="/farmer/ai" className="card text-center text-lg font-semibold hover:bg-leaf-50">🤖 Ask AI a question</Link>
            <Link to="/farmer/tickets" className="card text-center text-lg font-semibold hover:bg-leaf-50">🎫 Get expert help</Link>
            <Link to="/farmer/crops" className="card text-center text-lg font-semibold hover:bg-leaf-50">🌾 Add a crop</Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <div className="mb-2 flex items-center justify-between"><b className="text-leaf-900">🌾 My crops</b><Link className="text-sm text-leaf-700 underline" to="/farmer/crops">Manage</Link></div>
              {d.crops.length === 0 ? <Empty title="No crops yet" hint="Add your crops so AI and agents can give better advice." /> : (
                <ul className="divide-y">{d.crops.slice(0, 5).map((c) => <li key={c.id} className="flex justify-between py-2 text-sm"><span className="font-semibold">{c.crop_name}{c.variety ? ` (${c.variety})` : ''}</span><span className="text-gray-500">{c.expected_harvest_date ? `Harvest ${fmtDate(c.expected_harvest_date)}` : ''}</span></li>)}</ul>
              )}
            </div>
            <div className="card">
              <div className="mb-2 flex items-center justify-between"><b className="text-leaf-900">🎫 Open support requests</b><Link className="text-sm text-leaf-700 underline" to="/farmer/tickets">View all</Link></div>
              {d.openTickets.length === 0 ? <p className="py-4 text-sm text-gray-500">No open requests.</p> : (
                <ul className="divide-y">{d.openTickets.map((t) => <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{t.subject}</span><Badge value={t.status} /></li>)}</ul>
              )}
            </div>
            <div className="card">
              <div className="mb-2 flex items-center justify-between"><b className="text-leaf-900">🤖 Recent AI questions</b><Link className="text-sm text-leaf-700 underline" to="/farmer/ai">Open</Link></div>
              {d.recentAiChats.length === 0 ? <p className="py-4 text-sm text-gray-500">You have not asked the AI anything yet.</p> : <ul className="divide-y">{d.recentAiChats.map((c) => <li key={c.id} className="py-2 text-sm">{c.title}<span className="ml-2 text-xs text-gray-400">{fmtDate(c.updated_at)}</span></li>)}</ul>}
            </div>
            <div className="card">
              <div className="mb-2 flex items-center justify-between"><b className="text-leaf-900">💬 Recent conversation</b><Link className="text-sm text-leaf-700 underline" to="/farmer/chat">Open</Link></div>
              {d.conversation && d.conversation.last_message ? <p className="text-sm text-gray-700">“{d.conversation.last_message.slice(0, 140)}”</p> : <p className="py-4 text-sm text-gray-500">No messages yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
