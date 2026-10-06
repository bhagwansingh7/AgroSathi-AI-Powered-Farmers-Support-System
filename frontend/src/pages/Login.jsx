import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={`/${user.role}`} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const u = await login(email, password); navigate(`/${u.role}`); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-leaf-100 to-soil-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center"><div className="text-5xl">🌾</div><h1 className="mt-2 text-3xl font-bold text-leaf-900">AgroSathi</h1><p className="text-gray-600">Your farming companion: weather, AI help and expert agents.</p></div>
        <form onSubmit={submit} className="card space-y-4">
          <ErrorBox message={error} />
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
          <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-center text-sm text-gray-600">New farmer? <Link className="font-semibold text-leaf-700 underline" to="/register">Create an account</Link></p>
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">Development accounts are listed in the README (password <code>Password@123</code>).</p>
      </div>
    </div>
  );
}
