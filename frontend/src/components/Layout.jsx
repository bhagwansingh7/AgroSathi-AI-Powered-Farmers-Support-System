import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const NAV = {
  farmer: [['/farmer', '🏠', 'Home'], ['/farmer/crops', '🌾', 'My Crops'], ['/farmer/weather', '⛅', 'Weather'], ['/farmer/ai', '🤖', 'Ask AI'], ['/farmer/chat', '💬', 'My Agent'], ['/farmer/tickets', '🎫', 'Support Requests'], ['/farmer/profile', '👤', 'My Profile']],
  agent: [['/agent', '🏠', 'Dashboard'], ['/agent/farmers', '🧑‍🌾', 'My Farmers'], ['/agent/tickets', '🎫', 'My Tickets'], ['/agent/chat', '💬', 'Conversations']],
  admin: [['/admin', '📊', 'Dashboard'], ['/admin/farmers', '🧑‍🌾', 'Farmers'], ['/admin/agents', '🧑‍💼', 'Agents'], ['/admin/assignments', '🔗', 'Assignments'], ['/admin/tickets', '🎫', 'Tickets'], ['/admin/conversations', '💬', 'Conversations'], ['/admin/crops', '🌱', 'Crops & Locations'], ['/admin/knowledge', '📚', 'Knowledge Base'], ['/admin/alerts', '⛈️', 'Weather / Alerts'], ['/admin/audit', '🧾', 'Audit Logs'], ['/admin/settings', '⚙️', 'Settings']],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = NAV[user.role];
  const farmer = user.role === 'farmer';

  const link = ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 ${farmer ? 'py-3 text-base' : 'py-2 text-sm'} font-medium transition ${isActive ? 'bg-leaf-600 text-white' : 'text-leaf-100 hover:bg-leaf-700'}`;

  return (
    <div className="min-h-screen lg:flex">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-leaf-800 p-4 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 flex items-center gap-2 px-2 text-xl font-bold text-white"><span className="text-2xl">🌾</span> AgroSathi</div>
        <nav className="flex flex-col gap-1">
          {items.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to.split('/').length === 2} className={link} onClick={() => setOpen(false)}><span>{icon}</span>{label}</NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="rounded p-2 text-xl hover:bg-gray-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
            <span className="hidden text-sm text-gray-500 sm:block">{farmer ? 'Welcome' : user.role === 'agent' ? 'Agent workspace' : 'Administration'}, <b className="text-gray-800">{user.name}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button className="btn-secondary btn-sm" onClick={async () => { await logout(); navigate('/login'); }}>Log out</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
