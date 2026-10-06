import { useState } from 'react';
import { del, errorMessage, get, post } from '../../api/client.js';
import { Badge, ErrorBox, PageHeader, Spinner, Table, useLoad } from '../../components/ui.jsx';

export default function AdminAssignments() {
  const { data, loading, error, reload } = useLoad(() => get('/admin/assignments'));
  const [farmerId, setFarmerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, okMsg) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); setMsg(okMsg); reload(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const assign = (e) => { e.preventDefault(); run(() => post('/admin/assignments', { farmerId: Number(farmerId), agentId: Number(agentId) }), 'Assignment saved.').then(() => { setFarmerId(''); }); };
  const suggest = async () => { try { const d = await get('/admin/assignments/suggest'); if (d.agent) setAgentId(String(d.agent.id)); else setErr('No agent with free capacity.'); } catch (e) { setErr(errorMessage(e)); } };

  if (loading && !data) return <Spinner />;
  const agents = data ? data.agents : [];
  const farmers = data ? data.farmers : [];
  const farmer = farmers.find((f) => String(f.id) === farmerId);

  const agentCols = [
    { header: 'Agent', render: (a) => <span><b>{a.name}</b> {a.online && <span title="Online">🟢</span>}</span> },
    { header: 'Specialization', render: (a) => a.specialization || '–' },
    { header: 'Active farmers', render: (a) => <span className={a.active_farmers >= a.max_farmers ? 'font-bold text-red-700' : ''}>{a.active_farmers} / {a.max_farmers}</span> },
    { header: 'Active tickets', key: 'active_tickets' },
    { header: 'Pending tickets', key: 'pending_tickets' },
    { header: 'Status', render: (a) => <Badge value={a.is_active ? 'active' : 'disabled'}>{a.is_active ? 'Active' : 'Disabled'}</Badge> },
  ];
  const farmerCols = [
    { header: 'Farmer', render: (f) => <b>{f.name}</b> },
    { header: 'Location', render: (f) => [f.district, f.state].filter(Boolean).join(', ') || '–' },
    { header: 'Open tickets', key: 'open_tickets' },
    { header: 'Assigned agent', render: (f) => f.agent_name || <span className="text-amber-700">Unassigned</span> },
    { header: '', render: (f) => (
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" onClick={() => { setFarmerId(String(f.id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{f.agent_id ? 'Reassign' : 'Assign'}</button>
        {f.agent_id && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => window.confirm(`Unassign ${f.name} from ${f.agent_name}?`) && run(() => del(`/admin/assignments/${f.id}`), 'Farmer unassigned.')}>Unassign</button>}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Assignments" subtitle="Choose a farmer, choose an agent, assign. Reassigning replaces the current agent." />
      <ErrorBox message={error || err} onRetry={reload} />
      {msg && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{msg}</div>}
      <form onSubmit={assign} className="card mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="block"><span className="label">Farmer</span>
          <select className="input" value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required><option value="">Select farmer…</option>{farmers.map((f) => <option key={f.id} value={f.id}>{f.name}{f.agent_name ? ` (now: ${f.agent_name})` : ' (unassigned)'}</option>)}</select></label>
        <label className="block"><span className="label">Agent</span>
          <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)} required><option value="">Select agent…</option>{agents.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.active_farmers}/{a.max_farmers})</option>)}</select></label>
        <button type="button" className="btn-secondary" onClick={suggest} title="Picks the least-loaded agent. You still confirm with Assign.">Suggest agent</button>
        <button className="btn-primary" disabled={busy || !farmerId || !agentId}>{farmer && farmer.agent_id ? 'Reassign' : 'Assign'}</button>
      </form>
      <h2 className="mb-2 text-lg font-bold text-leaf-900">Agent workload</h2>
      <Table columns={agentCols} rows={agents} empty="No agents yet" />
      <p className="mt-1 text-xs text-gray-500">Pending = assigned, not started. Active = in progress or waiting for farmer.</p>
      <h2 className="mb-2 mt-6 text-lg font-bold text-leaf-900">Farmers</h2>
      <Table columns={farmerCols} rows={farmers} empty="No farmers yet" />
    </>
  );
}
