import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client.js';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-3 py-10 text-gray-500" role="status">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-leaf-500 border-t-transparent" />
    <span className="text-sm">{label}</span>
  </div>
);

export const ErrorBox = ({ message, onRetry }) => message ? (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
    {message} {onRetry && <button className="ml-2 font-semibold underline" onClick={onRetry}>Retry</button>}
  </div>
) : null;

export const Empty = ({ icon = '🌱', title, hint, children }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
    <div className="text-4xl">{icon}</div>
    <p className="font-semibold text-gray-700">{title}</p>
    {hint && <p className="max-w-sm text-sm text-gray-500">{hint}</p>}
    {children}
  </div>
);

const BADGES = {
  open: 'bg-blue-100 text-blue-800', assigned: 'bg-indigo-100 text-indigo-800', in_progress: 'bg-amber-100 text-amber-800',
  waiting_for_farmer: 'bg-purple-100 text-purple-800', resolved: 'bg-green-100 text-green-800', closed: 'bg-gray-200 text-gray-700',
  low: 'bg-gray-100 text-gray-700', medium: 'bg-sky-100 text-sky-800', high: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800',
  online: 'bg-green-100 text-green-800', offline: 'bg-gray-100 text-gray-600', active: 'bg-green-100 text-green-800', disabled: 'bg-red-100 text-red-700',
};
export const Badge = ({ value, children }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[value] || 'bg-gray-100 text-gray-700'}`}>
    {children || String(value).replace(/_/g, ' ')}
  </span>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold text-leaf-900">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </div>
    <div className="flex gap-2">{actions}</div>
  </div>
);

const TONES = { leaf: 'bg-leaf-100', amber: 'bg-amber-100', red: 'bg-red-100', blue: 'bg-blue-100' };
export const StatCard = ({ label, value, icon, tone = 'leaf' }) => (
  <div className="card flex items-center gap-4">
    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${TONES[tone]}`}>{icon}</div>
    <div>
      <div className="text-2xl font-bold text-gray-900">{value ?? '–'}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  </div>
);

export const Table = ({ columns, rows, empty = 'Nothing here yet', rowKey = 'id' }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50"><tr>{columns.map((c) => <th key={c.header} className="th">{c.header}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100">
        {rows.length === 0 && <tr><td className="td py-8 text-center text-gray-500" colSpan={columns.length}>{empty}</td></tr>}
        {rows.map((r) => <tr key={r[rowKey]} className="hover:bg-gray-50">{columns.map((c) => <td key={c.header} className="td">{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-leaf-900">{title}</h2>
          <button className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}</label>
);

// Small data-loading hook with loading/error/reload so every screen has real states.
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn().then((d) => { if (!cancelled) { setData(d); setError(''); } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1), setData };
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '–');
