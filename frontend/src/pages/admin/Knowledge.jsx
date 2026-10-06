import { useState } from 'react';
import { del, errorMessage, get, post, put } from '../../api/client.js';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Table, fmtDate, useLoad } from '../../components/ui.jsx';

function DocForm({ id, categories, onClose, onSaved }) {
  const { data, loading } = useLoad(() => (id ? get(`/knowledge/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const form = f || (data ? { title: data.document.title, category: data.document.category, source: data.document.source || '', content: data.document.content } : { title: '', category: 'general', source: '', content: '' });
  const set = (k) => (e) => setF({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = id ? await put(`/knowledge/${id}`, form) : await post('/knowledge', form); onSaved(r); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title={id ? 'Edit document' : 'Add knowledge document'} onClose={onClose} wide>
      {loading ? <Spinner /> : (
        <form onSubmit={submit} className="space-y-3"><ErrorBox message={error} />
          <Field label="Title"><input className="input" value={form.title} onChange={set('title')} required minLength={3} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category"><select className="input" value={form.category} onChange={set('category')}>{categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></Field>
            <Field label="Source (optional)"><input className="input" value={form.source} onChange={set('source')} placeholder="URL or publication" /></Field>
          </div>
          <Field label="Content" hint="Saved text is split into chunks and indexed for AI answers."><textarea className="input" rows={10} value={form.content} onChange={set('content')} required minLength={20} /></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving and indexing…' : 'Save and index'}</button>
        </form>
      )}
    </Modal>
  );
}

export default function AdminKnowledge() {
  const { data, loading, error, reload } = useLoad(() => get('/knowledge'));
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const act = async (fn, okMsg) => { setErr(''); setMsg(''); try { const r = await fn(); setMsg(typeof okMsg === 'function' ? okMsg(r) : okMsg); reload(); } catch (e) { setErr(errorMessage(e)); } };
  const search = async (e) => { e.preventDefault(); setErr(''); try { setResults((await get(`/knowledge/search?q=${encodeURIComponent(q)}`)).results); } catch (e2) { setErr(errorMessage(e2)); } };
  const docs = data ? data.documents : [];
  const cols = [
    { header: 'Title', render: (d) => <button className="text-left font-semibold text-leaf-800 hover:underline" onClick={() => setForm({ id: d.id })}>{d.title}</button> },
    { header: 'Category', render: (d) => <Badge>{d.category.replace(/_/g, ' ')}</Badge> },
    { header: 'Chunks', render: (d) => (d.chunks ? d.chunks : <span className="font-semibold text-red-700">Not indexed</span>) },
    { header: 'Updated', render: (d) => fmtDate(d.updated_at) },
    { header: '', render: (d) => <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setForm({ id: d.id })}>Edit</button><button className="btn-danger btn-sm" onClick={() => window.confirm(`Delete "${d.title}"?`) && act(() => del(`/knowledge/${d.id}`), 'Document deleted.')}>Delete</button></div> },
  ];
  return (
    <>
      <PageHeader title="Knowledge base" subtitle={data ? `Documents the AI uses to ground its answers. Embedding: ${data.embeddingModel}` : undefined}
        actions={<><button className="btn-secondary" onClick={() => act(() => post('/knowledge/reindex'), (r) => `Reindexed ${r.documents} document(s).`)}>Reindex all</button><button className="btn-primary" onClick={() => setForm({})}>+ Add document</button></>} />
      <ErrorBox message={error || err} onRetry={reload} />
      {msg && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{msg}</div>}
      {loading && !data ? <Spinner /> : docs.length === 0 && !error ? <Empty icon="📚" title="No documents yet" hint="Add crop, soil, irrigation or pest guidance for the AI to use." /> : <Table columns={cols} rows={docs} />}
      <form onSubmit={search} className="card mt-6 space-y-3">
        <div className="font-bold text-leaf-900">Test retrieval</div>
        <div className="flex gap-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. yellow wheat leaves after irrigation" /><button className="btn-secondary" disabled={q.trim().length < 2}>Search</button></div>
        {results && (results.length === 0 ? <p className="text-sm text-gray-500">No relevant passages found.</p> : (
          <ul className="space-y-2 text-sm">{results.map((r, i) => <li key={i} className="rounded-lg bg-gray-50 p-2"><b>{r.title}</b> <span className="text-xs text-gray-500">score {Number(r.score).toFixed(2)}</span><p className="mt-1 text-gray-700">{String(r.content).slice(0, 240)}…</p></li>)}</ul>
        ))}
      </form>
      {form && <DocForm id={form.id} categories={data ? data.categories : ['general']} onClose={() => setForm(null)} onSaved={(r) => { setForm(null); setMsg(r.indexError ? 'Saved, but indexing failed. Try Reindex all.' : 'Document saved and indexed.'); reload(); }} />}
    </>
  );
}
