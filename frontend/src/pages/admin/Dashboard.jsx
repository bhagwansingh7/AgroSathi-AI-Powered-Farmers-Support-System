import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../../api/client.js';
import { ErrorBox, PageHeader, Spinner, StatCard, useLoad } from '../../components/ui.jsx';

const day = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function AdminDashboard() {
  const { data, loading, error, reload } = useLoad(() => get('/admin/stats'));
  if (loading && !data) return <Spinner />;
  const t = data ? data.totals : {};
  return (
    <>
      <PageHeader title="Dashboard" subtitle="System overview" />
      <ErrorBox message={error} onRetry={reload} />
      {data && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total farmers" value={t.farmers} icon="🧑‍🌾" />
            <StatCard label="Total agents" value={t.agents} icon="🧑‍💼" tone="blue" />
            <StatCard label="Online agents" value={t.online_agents} icon="🟢" />
            <StatCard label="Unassigned farmers" value={t.unassigned_farmers} icon="🔗" tone="amber" />
            <StatCard label="Active tickets" value={t.active_tickets} icon="🎫" tone="blue" />
            <StatCard label="Open tickets" value={t.open_tickets} icon="📬" tone="amber" />
            <StatCard label="Resolved tickets" value={t.resolved_tickets} icon="✅" />
            <StatCard label="AI queries" value={t.ai_queries} icon="🤖" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <div className="mb-2 font-bold text-leaf-900">Tickets by status</div>
              <div className="h-60"><ResponsiveContainer><BarChart data={data.ticketsByStatus.map((s) => ({ ...s, status: s.status.replace(/_/g, ' ') }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="status" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#417a28" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </div>
            <div className="card">
              <div className="mb-2 font-bold text-leaf-900">New tickets, last 14 days</div>
              {data.ticketsPerDay.length === 0 ? <p className="py-16 text-center text-sm text-gray-500">No tickets in this period.</p> : (
                <div className="h-60"><ResponsiveContainer><LineChart data={data.ticketsPerDay.map((r) => ({ ...r, day: day(r.day) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#2f6da3" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
              )}
            </div>
            <div className="card lg:col-span-2">
              <div className="mb-2 font-bold text-leaf-900">AI queries, last 14 days</div>
              {data.aiPerDay.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No AI usage yet.</p> : (
                <div className="h-56"><ResponsiveContainer><BarChart data={data.aiPerDay.map((r) => ({ day: day(r.day), count: Number(r.count), failed: Number(r.failed) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Queries" fill="#417a28" radius={[4, 4, 0, 0]} /><Bar dataKey="failed" name="Failed" fill="#b3402f" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
