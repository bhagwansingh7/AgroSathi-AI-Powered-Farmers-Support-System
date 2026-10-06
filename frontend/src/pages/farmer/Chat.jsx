import { Link } from 'react-router-dom';
import { get } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import { Badge, Empty, ErrorBox, PageHeader, Spinner, useLoad } from '../../components/ui.jsx';

export default function FarmerChat() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => get('/conversations/mine'));
  if (loading && !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Chat with my agent" />
      <ErrorBox message={error} onRetry={reload} />
      {data && !data.agent && (
        <Empty icon="👨‍💼" title="No agent assigned yet" hint="Create a support request. An admin will assign an agent who can chat with you here.">
          <Link className="btn-primary" to="/farmer/tickets">Create support request</Link>
        </Empty>
      )}
      {data && data.agent && (
        <div className="space-y-3">
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div><span className="text-gray-500">Assigned agent:</span> <b>{data.agent.name}</b></div>
            <div><span className="text-gray-500">Specialization:</span> {data.agent.specialization || 'General'}</div>
            <div><span className="text-gray-500">Status:</span> <Badge value={data.agent.online ? 'online' : 'offline'}>{data.agent.online ? 'Online' : 'Offline'}</Badge></div>
          </div>
          <ChatPanel conversationId={data.conversationId} me={user} otherId={data.agent.id} otherName={data.agent.name} />
          <p className="text-xs text-gray-500">Your agent may reply later if offline. You will get a notification.</p>
        </div>
      )}
    </>
  );
}
