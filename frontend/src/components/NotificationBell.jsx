import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../api/client.js';
import { getSocket } from '../api/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtDateTime } from './ui.jsx';

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const ref = useRef(null);

  const load = useCallback(() => get('/notifications').then((d) => { setItems(d.notifications.slice(0, 8)); setUnread(d.unread); }).catch(() => {}), []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNew = (n) => { setItems((l) => [n, ...l].slice(0, 8)); setUnread((u) => u + 1); setToast(n); setTimeout(() => setToast(null), 5000); };
    socket.on('notification:new', onNew);
    socket.on('connect', load); // catch up after reconnects
    return () => { socket.off('notification:new', onNew); socket.off('connect', load); };
  }, [load]);

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAll = async () => { await patch('/notifications/read-all'); setUnread(0); setItems((l) => l.map((n) => ({ ...n, is_read: 1 }))); };
  const markOne = async (n) => { if (!n.is_read) { await patch(`/notifications/${n.id}/read`).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x))); } setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-full p-2 text-xl hover:bg-gray-100" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔{unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2"><b className="text-sm">Notifications</b><button className="text-xs text-leaf-700 underline" onClick={markAll}>Mark all read</button></div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="p-4 text-center text-sm text-gray-500">No notifications yet</p>}
            {items.map((n) => (
              <Link key={n.id} to={n.link || `/${user.role}/notifications`} onClick={() => markOne(n)} className={`block border-b px-4 py-2 text-sm hover:bg-gray-50 ${n.is_read ? '' : 'bg-leaf-50'}`}>
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="truncate text-gray-600">{n.body}</div>}
                <div className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</div>
              </Link>
            ))}
          </div>
          <Link to={`/${user.role}/notifications`} className="block px-4 py-2 text-center text-sm font-semibold text-leaf-700" onClick={() => setOpen(false)}>View all</Link>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-leaf-200 bg-white p-3 shadow-lg" role="status">
          <div className="text-sm font-semibold">🔔 {toast.title}</div>
          {toast.body && <div className="text-sm text-gray-600">{toast.body}</div>}
        </div>
      )}
    </div>
  );
}
