import { useState } from 'react';
import { get, patch, post, errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import AgentAiAssist from '../components/AgentAiAssist.jsx';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Table, fmtDateTime, useLoad } from '../components/ui.jsx';

const STATUSES = ['open', 'assigned', 'in_progress', 'waiting_for_farmer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CATEGORIES = ['general', 'crop_disease', 'pest_disease', 'irrigation', 'fertilizer', 'harvest', 'weather', 'market', 'other'];

function CreateTicket({ onClose, onCreated }) {
  const { data: crops } = useLoad(() => get('/crops'));
  const [f, setF] = useState({ subject: '', description: '', category: 'general', priority: 'medium', crop_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await post('/tickets', { ...f, crop_id: f.crop_id || null }); onCreated(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title="New support request" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="What is the problem? (short title)"><input className="input" value={f.subject} onChange={set('subject')} required minLength={3} maxLength={200} /></Field>
        <Field label="Describe it in detail"><textarea className="input" rows={4} value={f.description} onChange={set('description')} required minLength={5} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type"><select className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></Field>
          <Field label="How urgent?"><select className="input" value={f.priority} onChange={set('priority')}>{PRIORITIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Which crop?"><select className="input" value={f.crop_id} onChange={set('crop_id')}><option value="">Not sure / general</option>{(crops ? crops.crops : []).map((c) => <option key={c.id} value={c.id}>{c.crop_name}</option>)}</select></Field>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </form>
    </Modal>
  );
}

function TicketDetail({ id, role, onClose, onChanged }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => get(`/tickets/${id}`), [id]);
  const { data: agents } = useLoad(() => (role === 'admin' ? get('/agents') : Promise.resolve(null)));
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const update = async (body) => { setErr(''); try { await patch(`/tickets/${id}`, body); reload(); onChanged(); } catch (e) { setErr(errorMessage(e)); } };
  const send = async (e) => {
    e.preventDefault(); if (!reply.trim()) return; setBusy(true); setErr('');
    try { await post(`/tickets/${id}/messages`, { body: reply }); setReply(''); reload(); onChanged(); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Modal title={data ? `#${data.ticket.id} · ${data.ticket.subject}` : 'Ticket'} onClose={onClose} wide>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data && (
        <div className="space-y-4">
          <ErrorBox message={err} />
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge value={data.ticket.status} /><Badge value={data.ticket.priority} /><span className="text-gray-500">{data.ticket.category.replace(/_/g, ' ')}</span>
            {data.ticket.crop_name && <span>· 🌾 {data.ticket.crop_name}</span>}<span className="text-gray-500">· {fmtDateTime(data.ticket.created_at)}</span></div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm"><b>{data.ticket.farmer_name}</b> ({[data.ticket.farmer_district, data.ticket.farmer_state].filter(Boolean).join(', ')}) <p className="mt-1 whitespace-pre-wrap">{data.ticket.description}</p></div>
          {role !== 'farmer' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Status"><select className="input" value={data.ticket.status} onChange={(e) => update({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></Field>
              <Field label="Priority"><select className="input" value={data.ticket.priority} onChange={(e) => update({ priority: e.target.value })}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              {role === 'admin' && <Field label="Agent"><select className="input" value={data.ticket.agent_id || ''} onChange={(e) => update({ agent_id: e.target.value ? Number(e.target.value) : null })}><option value="">Unassigned</option>{agents && agents.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
            </div>
          )}
          {role === 'farmer' && data.ticket.agent_name && <p className="text-sm">Assigned agent: <b>{data.ticket.agent_name}</b></p>}
          {role === 'farmer' && !['closed', 'resolved'].includes(data.ticket.status) && <button className="btn-secondary btn-sm" onClick={() => update({ status: 'closed' })}>Close this request</button>}

          <div className="space-y-2">
            <div className="font-semibold">Replies</div>
            {data.messages.length === 0 && <p className="text-sm text-gray-500">No replies yet.</p>}
            {data.messages.map((m) => (
              <div key={m.id} className={`rounded-lg p-2 text-sm ${m.sender_id === user.id ? 'bg-leaf-50' : 'bg-gray-50'}`}><div className="text-xs text-gray-500">{m.sender_name} ({m.sender_role}) · {fmtDateTime(m.created_at)}</div><div className="whitespace-pre-wrap">{m.body}</div></div>
            ))}
          </div>
          {data.ticket.status !== 'closed' && (
            <form onSubmit={send} className="space-y-2">
              <textarea className="input" rows={3} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="btn-primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
            </form>
          )}
          {role !== 'farmer' && <AgentAiAssist ticketId={id} draft={reply} onUse={setReply} />}
        </div>
      )}
    </Modal>
  );
}

export default function TicketsPage({ role }) {
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const { data, loading, error, reload } = useLoad(() => get(`/tickets${status ? `?status=${status}` : ''}`), [status]);
  const tickets = data ? data.tickets : [];
  const cols = [
    { header: '#', render: (t) => `#${t.id}` },
    { header: 'Subject', render: (t) => <button className="text-left font-semibold text-leaf-800 hover:underline" onClick={() => setOpenId(t.id)}>{t.subject}</button> },
    ...(role !== 'farmer' ? [{ header: 'Farmer', key: 'farmer_name' }] : []),
    { header: 'Crop', render: (t) => t.crop_name || '–' },
    ...(role !== 'agent' ? [{ header: 'Agent', render: (t) => t.agent_name || <span className="text-gray-400">Not assigned</span> }] : []),
    { header: 'Priority', render: (t) => <Badge value={t.priority} /> },
    { header: 'Status', render: (t) => <Badge value={t.status} /> },
    { header: 'Created', render: (t) => fmtDateTime(t.created_at) },
  ];

  return (
    <>
      <PageHeader title={role === 'farmer' ? 'My support requests' : role === 'agent' ? 'My tickets' : 'All tickets'}
        subtitle={role === 'farmer' ? 'Ask your agent for help and track progress here.' : undefined}
        actions={<>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
          {role === 'farmer' && <button className="btn-primary" onClick={() => setCreating(true)}>+ New request</button>}
        </>} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : tickets.length === 0 && !error ? (
        <Empty icon="🎫" title="No tickets found" hint={role === 'farmer' ? 'Need help from an expert? Create a support request.' : undefined}>
          {role === 'farmer' && <button className="btn-primary" onClick={() => setCreating(true)}>+ New request</button>}
        </Empty>
      ) : <Table columns={cols} rows={tickets} />}
      {creating && <CreateTicket onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {openId && <TicketDetail id={openId} role={role} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
