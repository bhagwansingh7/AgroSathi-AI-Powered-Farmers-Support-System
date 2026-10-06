import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, errorMessage } from '../api/client.js';
import { getSocket } from '../api/socket.js';
import { Badge, ErrorBox, Spinner, fmtTime } from './ui.jsx';

// Real-time conversation over Socket.IO. History always comes from MySQL (REST); the socket adds
// live delivery, typing, presence and read receipts. On reconnect it re-joins and re-syncs history.
export default function ChatPanel({ conversationId, me, otherId, otherName, readOnly = false, draft, setDraft }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(getSocket().connected);
  const [otherOnline, setOtherOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [localText, setLocalText] = useState('');
  const text = draft !== undefined ? draft : localText;
  const setText = setDraft || setLocalText;
  const bottom = useRef(null);
  const stopTimer = useRef(null);
  const typingSent = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const d = await get(`/conversations/${conversationId}/messages?limit=100`);
      setMessages(d.messages); setError('');
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [conversationId]);

  const markRead = useCallback(() => { if (!readOnly) getSocket().emit('message:read', { conversationId }, () => {}); }, [conversationId, readOnly]);

  useEffect(() => {
    setLoading(true); setMessages([]); setTyping(false);
    const socket = getSocket();
    const join = () => socket.emit('conversation:join', { conversationId }, (r) => { if (r && r.ok) setOtherOnline(r.otherOnline); });
    const onConnect = () => { setConnected(true); join(); loadHistory().then(markRead); };
    const onDisconnect = () => setConnected(false);
    const onNew = (m) => {
      if (m.conversation_id !== conversationId) return;
      setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
      if (m.sender_id !== me.id) { markRead(); setTyping(false); }
    };
    const onRead = (p) => { if (p.conversationId === conversationId && p.readerId !== me.id) setMessages((l) => l.map((m) => (m.sender_id === me.id && !m.read_at ? { ...m, read_at: p.at } : m))); };
    const onTyping = (p) => { if (p.conversationId === conversationId && p.userId !== me.id) setTyping(p.typing); };
    const onPresence = (p) => { if (p.userId === otherId) setOtherOnline(p.online); };

    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('message:new', onNew);
    socket.on('message:read', onRead); socket.on('typing', onTyping); socket.on('presence:update', onPresence);
    if (socket.connected) join();
    loadHistory().then(markRead);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('message:new', onNew); socket.off('message:read', onRead); socket.off('typing', onTyping); socket.off('presence:update', onPresence); };
  }, [conversationId, me.id, otherId, loadHistory, markRead]);

  useEffect(() => { bottom.current && bottom.current.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, typing]);

  const onType = (v) => {
    setText(v);
    const socket = getSocket();
    if (!typingSent.current) { socket.emit('typing:start', { conversationId }); typingSent.current = true; }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => { socket.emit('typing:stop', { conversationId }); typingSent.current = false; }, 1500);
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText(''); setError('');
    clearTimeout(stopTimer.current); getSocket().emit('typing:stop', { conversationId }); typingSent.current = false;
    const socket = getSocket();
    const fallback = async () => {
      try { const d = await post(`/conversations/${conversationId}/messages`, { body }); setMessages((l) => (l.some((x) => x.id === d.message.id) ? l : [...l, d.message])); } catch (err) { setError(errorMessage(err)); setText(body); }
    };
    if (!socket.connected) return fallback(); // REST fallback keeps working while the socket reconnects
    socket.timeout(8000).emit('message:send', { conversationId, body }, (err, r) => {
      if (err) return fallback();
      if (!r.ok) { setError(r.message); setText(body); return; }
      setMessages((l) => (l.some((x) => x.id === r.message.id) ? l : [...l, r.message]));
    });
  };

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="font-semibold">{otherName || 'Conversation'} {otherId && <Badge value={otherOnline ? 'online' : 'offline'} />}</div>
        {!connected && <span className="text-xs font-semibold text-amber-700">Reconnecting…</span>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-soil-50 p-4">
        {loading && <Spinner />}
        {!loading && messages.length === 0 && <p className="py-10 text-center text-sm text-gray-500">No messages yet. Say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? 'bg-leaf-600 text-white' : 'bg-white'}`}>
                {readOnly && <div className="text-xs font-semibold opacity-70">{m.sender_name} ({m.sender_role})</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-1 text-right text-[10px] ${mine ? 'text-leaf-100' : 'text-gray-400'}`}>{fmtTime(m.created_at)} {mine && (m.read_at ? '✓✓' : '✓')}</div>
              </div>
            </div>
          );
        })}
        {typing && <div className="text-xs italic text-gray-500">{otherName} is typing…</div>}
        <div ref={bottom} />
      </div>
      {error && <div className="px-3 pt-2"><ErrorBox message={error} /></div>}
      {readOnly ? <div className="border-t p-3 text-center text-sm text-gray-500">Monitoring view (read-only)</div> : (
        <form onSubmit={send} className="flex gap-2 border-t p-3">
          <textarea className="input min-h-[44px] flex-1 resize-none" rows={2} value={text} onChange={(e) => onType(e.target.value)} placeholder="Type a message…" maxLength={4000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <button className="btn-primary self-end" disabled={!text.trim()}>Send</button>
        </form>
      )}
    </div>
  );
}
