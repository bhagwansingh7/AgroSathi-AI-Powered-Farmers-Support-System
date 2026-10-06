import { get, patch } from '../api/client.js';
import { Empty, ErrorBox, PageHeader, Spinner, fmtDateTime, useLoad } from '../components/ui.jsx';
import { Link } from 'react-router-dom';

export default function NotificationsPage() {
  const { data, loading, error, reload } = useLoad(() => get('/notifications'));
  const markAll = async () => { await patch('/notifications/read-all'); reload(); };
  return (
    <>
      <PageHeader title="Notifications" actions={<button className="btn-secondary btn-sm" onClick={markAll}>Mark all read</button>} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data && data.notifications.length === 0 ? <Empty icon="🔔" title="No notifications yet" /> : (
        <div className="space-y-2">
          {data && data.notifications.map((n) => (
            <Link key={n.id} to={n.link || '#'} onClick={() => !n.is_read && patch(`/notifications/${n.id}/read`)} className={`card block ${n.is_read ? '' : 'border-leaf-300 bg-leaf-50'}`}>
              <div className="font-semibold">{n.title}</div>
              {n.body && <div className="text-sm text-gray-600">{n.body}</div>}
              <div className="mt-1 text-xs text-gray-400">{fmtDateTime(n.created_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
