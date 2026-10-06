import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { get } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import AgentAiAssist from '../../components/AgentAiAssist.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import WeatherCard from '../../components/WeatherCard.jsx';
import { Empty, ErrorBox, PageHeader, Spinner, fmtTime, useLoad } from '../../components/ui.jsx';

export default function AgentChat() {
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, reload } = useLoad(() => get('/conversations'));
  const [activeId, setActiveId] = useState((location.state && location.state.conversationId) || null);
  const [draft, setDraft] = useState('');
  const list = data ? data.conversations : [];
  const active = list.find((c) => c.id === activeId);

  useEffect(() => { if (!activeId && list.length) setActiveId(list[0].id); }, [list, activeId]);
  useEffect(() => { setDraft(''); }, [activeId]);
  // Refresh unread badges when new messages arrive.
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, []); // eslint-disable-line

  if (loading && !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Conversations" subtitle="Real-time chat with your farmers." />
      <ErrorBox message={error} onRetry={reload} />
      {list.length === 0 && !error ? <Empty icon="💬" title="No conversations yet" hint="Conversations appear once a farmer is assigned to you." /> : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="card max-h-[70vh] divide-y overflow-y-auto p-0 sm:p-0">
            {list.map((c) => (
              <li key={c.id}>
                <button className={`w-full p-3 text-left hover:bg-gray-50 ${c.id === activeId ? 'bg-leaf-50' : ''}`} onClick={() => setActiveId(c.id)}>
                  <div className="flex items-center justify-between"><b>{c.farmer_name}</b>{c.unread > 0 && <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{c.unread}</span>}</div>
                  <div className="truncate text-xs text-gray-500">{c.last_message || 'No messages yet'}</div>
                  <div className="text-[10px] text-gray-400">{c.last_message_at ? fmtTime(c.last_message_at) : ''} {c.farmer_online ? '· 🟢 online' : ''}</div>
                </button>
              </li>
            ))}
          </ul>
          {active ? (
            <div className="space-y-4">
              <ChatPanel key={active.id} conversationId={active.id} me={user} otherId={active.farmer_id} otherName={active.farmer_name} draft={draft} setDraft={setDraft} />
              <AgentAiAssist conversationId={active.id} draft={draft} onUse={setDraft} />
              <WeatherCard path={`/weather/farmer/${active.farmer_id}`} compact title={`${active.farmer_name}'s farm`} />
            </div>
          ) : <Empty title="Select a conversation" />}
        </div>
      )}
    </>
  );
}
