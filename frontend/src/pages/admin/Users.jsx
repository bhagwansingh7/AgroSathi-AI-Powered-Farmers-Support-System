import { useState } from 'react';
import { del, errorMessage, get, post, put } from '../../api/client.js';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Table, fmtDate, useLoad } from '../../components/ui.jsx';

function UserForm({ role, user, onClose, onSaved }) {
  const editing = !!user;
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', mobile: user?.mobile || '', password: '', specialization: user?.specialization || '', max_farmers: user?.max_farmers || 25, is_active: user ? !!user.is_active : true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = { name: f.name, email: f.email, mobile: f.mobile, ...(f.password ? { password: f.password } : {}) };
      if (role === 'agent') { body.specialization = f.specialization; body.max_farmers = Number(f.max_farmers); }
      if (editing) await put(`/admin/users/${user.id}`, { ...body, is_active: f.is_active });
      else await post('/admin/users', { ...body, role });
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${editing ? 'Edit' : 'Add'} ${role}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} required minLength={2} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Mobile"><input className="input" value={f.mobile} onChange={set('mobile')} /></Field>
        <Field label={editing ? 'New password (leave blank to keep)' : 'Password'} hint="At least 8 characters with a letter and a number."><input className="input" type="password" value={f.password} onChange={set('password')} required={!editing} minLength={8} autoComplete="new-password" /></Field>
        {role === 'agent' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Specialization"><input className="input" value={f.specialization} onChange={set('specialization')} placeholder="e.g. Crop disease" /></Field>
            <Field label="Max farmers"><input className="input" type="number" min={1} max={500} value={f.max_farmers} onChange={set('max_farmers')} /></Field>
          </div>
        )}
        {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Account is active (can log in)</label>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

// Used for both /admin/farmers and /admin/agents.
export default function AdminUsers({ role }) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // null | {} (new) | user
  const [err, setErr] = useState('');
  const { data, loading, error, reload } = useLoad(() => get(`/admin/users?role=${role}${search ? `&search=${encodeURIComponent(search)}` : ''}`), [role, search]);
  const { data: farmerInfo } = useLoad(() => (role === 'farmer' ? get('/farmers') : Promise.resolve(null)), [role]);
  const extra = {};
  if (farmerInfo) farmerInfo.farmers.forEach((x) => { extra[x.id] = x; });
  const rows = data ? data.users : [];

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This also removes their crops, tickets and messages.`)) return;
    setErr(''); try { await del(`/admin/users/${u.id}`); reload(); } catch (e) { setErr(errorMessage(e)); }
  };
  const label = role === 'farmer' ? 'farmers' : 'agents';
  const cols = [
    { header: 'Name', render: (u) => <b>{u.name}</b> },
    { header: 'Email', key: 'email' },
    { header: 'Mobile', render: (u) => u.mobile || '–' },
    ...(role === 'farmer' ? [
      { header: 'Location', render: (u) => [extra[u.id]?.district, extra[u.id]?.state].filter(Boolean).join(', ') || '–' },
      { header: 'Agent', render: (u) => extra[u.id]?.agent_name || <span className="text-gray-400">Not assigned</span> },
    ] : [
      { header: 'Specialization', render: (u) => u.specialization || '–' },
      { header: 'Capacity', render: (u) => u.max_farmers },
    ]),
    { header: 'Status', render: (u) => <Badge value={u.is_active ? 'active' : 'disabled'}>{u.is_active ? 'Active' : 'Disabled'}</Badge> },
    { header: 'Joined', render: (u) => fmtDate(u.created_at) },
    { header: '', render: (u) => <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setForm(u)}>Edit</button><button className="btn-danger btn-sm" onClick={() => remove(u)}>Delete</button></div> },
  ];
  return (
    <>
      <PageHeader title={role === 'farmer' ? 'Farmers' : 'Agents'} subtitle={`Create, update and remove ${label}.`}
        actions={<><input className="input w-52" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" /><button className="btn-primary" onClick={() => setForm({})}>+ Add {role}</button></>} />
      <ErrorBox message={error || err} onRetry={reload} />
      {loading && !data ? <Spinner /> : rows.length === 0 && !error ? <Empty icon="👥" title={`No ${label} found`} /> : <Table columns={cols} rows={rows} />}
      {form && <UserForm role={role} user={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </>
  );
}
