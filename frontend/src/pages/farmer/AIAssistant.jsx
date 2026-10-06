import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AI_TIMEOUT, del, errorMessage, get, post } from '../../api/client.js';
import { Badge, ErrorBox, PageHeader, Spinner, useLoad } from '../../components/ui.jsx';

const SUGGESTIONS = ['Why are my wheat leaves turning yellow?', 'When should I irrigate my crop?', 'What should I do if heavy rain is expected?', 'Which fertilizer is commonly used for wheat?'];

export default function FarmerAI() {
  const convs = useLoad(() => get('/ai/conversations'));
  const status = useLoad(() => get('/ai/status'));
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recs, setRecs] = useState(null);
  const bottom = useRef(null);

  useEffect(() => { bottom.current && bottom.current.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, busy]);

  const open = async (id) => {
    setActiveId(id); setError('');
    if (!id) return setMessages([]);
    try { const d = await get(`/ai/conversations/${id}`); setMessages(d.messages); } catch (e) { setError(errorMessage(e)); }
  };

  const ask = async (q) => {
    const message = (q ?? text).trim();
    if (message.length < 2 || busy) return;
    setText(''); setError(''); setBusy(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: message }]);
    try {
      const d = await post('/ai/chat', { message, ...(activeId ? { conversationId: activeId } : {}) }, { timeout: AI_TIMEOUT });
      setMessages((m) => [...m, { ...d.message, aiAvailable: d.aiAvailable }]);
      if (!activeId) { setActiveId(d.conversationId); convs.reload(); }
    } catch (e) {
      setError(errorMessage(e, 'The AI could not answer right now.') + ' You can still chat with your agent.');
    } finally { setBusy(false); }
  };

  const getRecs = async () => { setRecs({ loading: true }); try { setRecs(await get('/ai/recommendations', { timeout: AI_TIMEOUT })); } catch (e) { setRecs({ error: errorMessage(e) }); } };
  const remove = async (id) => { if (!window.confirm('Delete this conversation?')) return; await del(`/ai/conversations/${id}`); if (id === activeId) open(null); convs.reload(); };

  return (
    <>
      <PageHeader title="Ask AgroSathi AI" subtitle="Farming questions answered using our knowledge base and your crop details." actions={<button className="btn-secondary btn-sm" onClick={getRecs}>🌱 Crop recommendations</button>} />
      {status.data && !status.data.aiConfigured && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The AI model is not configured on this server. You will see matching guidance from the knowledge base only. <Link className="font-semibold underline" to="/farmer/tickets">Ask an agent instead</Link>.</div>}
      {recs && (
        <div className="card mb-4 space-y-2">
          <div className="flex items-center justify-between"><b>Recommendations for your crops</b><button className="text-sm underline" onClick={() => setRecs(null)}>Hide</button></div>
          {recs.loading ? <Spinner /> : recs.error ? <ErrorBox message={recs.error} /> : (<><ul className="list-disc space-y-1 pl-5 text-sm">{recs.items.map((i, k) => <li key={k}>{i}</li>)}</ul><div className="text-xs text-gray-500">{recs.source === 'ai' ? 'AI-generated' : 'Rule-based tips from your crop dates'} · {recs.disclaimer}</div></>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="card space-y-2 lg:col-span-1">
          <button className="btn-primary w-full" onClick={() => open(null)}>+ New question</button>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {convs.data && convs.data.conversations.map((c) => (
              <div key={c.id} className={`flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-sm ${c.id === activeId ? 'bg-leaf-100' : 'hover:bg-gray-50'}`}>
                <button className="flex-1 truncate text-left" onClick={() => open(c.id)}>{c.title}</button>
                <button className="text-gray-400 hover:text-red-600" onClick={() => remove(c.id)} aria-label="Delete conversation">🗑</button>
              </div>
            ))}
            {convs.data && convs.data.conversations.length === 0 && <p className="text-xs text-gray-500">No previous conversations.</p>}
          </div>
        </div>
        <div className="flex h-[70vh] min-h-[420px] flex-col rounded-xl border border-gray-200 bg-white lg:col-span-3">
          <div className="flex-1 space-y-3 overflow-y-auto bg-soil-50 p-4">
            {messages.length === 0 && (
              <div className="space-y-3 py-6 text-center"><div className="text-4xl">🤖</div><p className="text-gray-600">Ask me anything about your crops. Try:</p>
                <div className="flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <button key={s} className="btn-secondary btn-sm" onClick={() => ask(s)}>{s}</button>)}</div></div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.role === 'user' ? 'bg-leaf-600 text-white' : 'bg-white'}`}>
                  {m.role === 'assistant' && <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-leaf-700">AI-generated guidance {m.model ? '' : <Badge value="offline">AI offline</Badge>}</div>}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.role === 'assistant' && m.sources && m.sources.length > 0 && <div className="mt-2 text-xs text-gray-500">📚 Based on: {m.sources.map((s) => s.title).join(' · ')}</div>}
                  {m.role === 'assistant' && <div className="mt-2 border-t pt-1 text-xs text-gray-500">Please confirm important decisions with your agent. <Link className="underline" to="/farmer/chat">Talk to my agent</Link></div>}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm italic text-gray-500">AI is thinking…</div>}
            <div ref={bottom} />
          </div>
          {error && <div className="px-3 pt-2"><ErrorBox message={error} /></div>}
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2 border-t p-3">
            <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…" maxLength={2000} disabled={busy} />
            <button className="btn-primary" disabled={busy || text.trim().length < 2}>Ask</button>
          </form>
        </div>
      </div>
    </>
  );
}
