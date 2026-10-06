import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { ErrorBox, Field } from '../components/ui.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', location: '', district: '', state: '', country: 'India' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={`/${user.role}`} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await register(f); navigate('/farmer'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-leaf-100 to-soil-100 p-4">
      <form onSubmit={submit} className="card w-full max-w-lg space-y-4">
        <div className="text-center"><div className="text-4xl">🌾</div><h1 className="text-2xl font-bold text-leaf-900">Create your farmer account</h1></div>
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} required minLength={2} /></Field>
          <Field label="Mobile number"><input className="input" value={f.mobile} onChange={set('mobile')} required inputMode="tel" /></Field>
          <Field label="Email"><input type="email" className="input" value={f.email} onChange={set('email')} required /></Field>
          <Field label="Password" hint="At least 8 characters, with a letter and a number"><input type="password" className="input" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></Field>
          <Field label="Village / town"><input className="input" value={f.location} onChange={set('location')} /></Field>
          <Field label="District"><input className="input" value={f.district} onChange={set('district')} required /></Field>
          <Field label="State"><input className="input" value={f.state} onChange={set('state')} required /></Field>
          <Field label="Country"><input className="input" value={f.country} onChange={set('country')} /></Field>
        </div>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
        <p className="text-center text-sm text-gray-600">Already registered? <Link className="font-semibold text-leaf-700 underline" to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
