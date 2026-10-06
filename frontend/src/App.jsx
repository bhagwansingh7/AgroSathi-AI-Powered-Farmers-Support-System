import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import NotificationsPage from './pages/Notifications.jsx';
import TicketsPage from './pages/Tickets.jsx';
import FarmerDashboard from './pages/farmer/Dashboard.jsx';
import FarmerCrops from './pages/farmer/Crops.jsx';
import FarmerChat from './pages/farmer/Chat.jsx';
import FarmerAI from './pages/farmer/AIAssistant.jsx';
import FarmerWeather from './pages/farmer/Weather.jsx';
import FarmerProfile from './pages/farmer/Profile.jsx';
import AgentDashboard from './pages/agent/Dashboard.jsx';
import AgentFarmers from './pages/agent/Farmers.jsx';
import AgentChat from './pages/agent/Chat.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminAssignments from './pages/admin/Assignments.jsx';
import AdminConversations from './pages/admin/Conversations.jsx';
import AdminCrops from './pages/admin/Crops.jsx';
import AdminKnowledge from './pages/admin/Knowledge.jsx';
import AdminAlerts from './pages/admin/WeatherAlerts.jsx';
import AdminAudit from './pages/admin/AuditLogs.jsx';
import AdminSettings from './pages/admin/Settings.jsx';

const home = (role) => `/${role}`;

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Starting AgroSathi…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={home(user.role)} replace />;
  return <Layout>{children}</Layout>;
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? home(user.role) : '/login'} replace />;
}

export default function App() {
  const P = (role, el) => <Protected role={role}>{el}</Protected>;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/farmer" element={P('farmer', <FarmerDashboard />)} />
      <Route path="/farmer/crops" element={P('farmer', <FarmerCrops />)} />
      <Route path="/farmer/tickets" element={P('farmer', <TicketsPage role="farmer" />)} />
      <Route path="/farmer/chat" element={P('farmer', <FarmerChat />)} />
      <Route path="/farmer/ai" element={P('farmer', <FarmerAI />)} />
      <Route path="/farmer/weather" element={P('farmer', <FarmerWeather />)} />
      <Route path="/farmer/profile" element={P('farmer', <FarmerProfile />)} />
      <Route path="/farmer/notifications" element={P('farmer', <NotificationsPage />)} />

      <Route path="/agent" element={P('agent', <AgentDashboard />)} />
      <Route path="/agent/farmers" element={P('agent', <AgentFarmers />)} />
      <Route path="/agent/tickets" element={P('agent', <TicketsPage role="agent" />)} />
      <Route path="/agent/chat" element={P('agent', <AgentChat />)} />
      <Route path="/agent/notifications" element={P('agent', <NotificationsPage />)} />

      <Route path="/admin" element={P('admin', <AdminDashboard />)} />
      <Route path="/admin/farmers" element={P('admin', <AdminUsers role="farmer" />)} />
      <Route path="/admin/agents" element={P('admin', <AdminUsers role="agent" />)} />
      <Route path="/admin/assignments" element={P('admin', <AdminAssignments />)} />
      <Route path="/admin/tickets" element={P('admin', <TicketsPage role="admin" />)} />
      <Route path="/admin/conversations" element={P('admin', <AdminConversations />)} />
      <Route path="/admin/crops" element={P('admin', <AdminCrops />)} />
      <Route path="/admin/knowledge" element={P('admin', <AdminKnowledge />)} />
      <Route path="/admin/alerts" element={P('admin', <AdminAlerts />)} />
      <Route path="/admin/audit" element={P('admin', <AdminAudit />)} />
      <Route path="/admin/settings" element={P('admin', <AdminSettings />)} />
      <Route path="/admin/notifications" element={P('admin', <NotificationsPage />)} />

      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
