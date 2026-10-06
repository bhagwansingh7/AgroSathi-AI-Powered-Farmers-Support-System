import { useState } from 'react';
import { get } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import { Empty, ErrorBox, Modal, PageHeader, Spinner, Table, fmtDateTime, useLoad } from '../../components/ui.jsx';

export default function AdminConversations() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => get('/conversations'));
  const [open, setOpen] = useState(null);
  const rows = data ? data.conversations : [];
  const cols = [
    { header: 'Farmer', render: (c) => <b>{c.farmer_name}</b> },
    { header: 'Agent', render: (c) => c.agent_name || <span className="text-gray-400">Not assigned</span> },
    { header: 'Last message', render: (c) => <span className="line-clamp-1 max-w-xs">{c.last_message || '–'}</span> },
    { header: 'Messages', key: 'message_count' },
    { header: 'Last activity', render: (c) => fmtDateTime(c.last_message_at) },
    { header: '', render: (c) => <button className="btn-secondary btn-sm" onClick={() => setOpen(c)}>View</button> },
  ];
  return (
    <>
      <PageHeader title="Conversations" subtitle="Read-only monitoring of farmer–agent chats." />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : rows.length === 0 && !error ? <Empty icon="💬" title="No conversations yet" /> : <Table columns={cols} rows={rows} />}
      {open && <Modal title={`${open.farmer_name} ↔ ${open.agent_name || 'no agent'}`} onClose={() => setOpen(null)} wide><ChatPanel conversationId={open.id} me={user} readOnly otherName={open.farmer_name} /></Modal>}
    </>
  );
}
