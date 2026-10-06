import { useEffect, useState } from 'react';
import { get, errorMessage } from '../api/client.js';
import { Spinner } from './ui.jsx';

const icon = (c = '') => { const s = c.toLowerCase(); return s.includes('thunder') ? '⛈️' : s.includes('rain') || s.includes('drizzle') || s.includes('shower') ? '🌧️' : s.includes('snow') ? '❄️' : s.includes('fog') || s.includes('mist') ? '🌫️' : s.includes('overcast') || s.includes('cloud') ? '☁️' : s.includes('partly') ? '⛅' : '☀️'; };

// Loads weather from the given API path. Failures stay inside this card so the rest of the page keeps working.
export function useWeather(path) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    setState({ loading: true, data: null, error: '' });
    get(path).then((data) => !cancelled && setState({ loading: false, data, error: '' })).catch((e) => !cancelled && setState({ loading: false, data: null, error: errorMessage(e) }));
    return () => { cancelled = true; };
  }, [path]);
  return state;
}

export function WeatherAlerts({ alerts = [] }) {
  return alerts.map((a) => (
    <div key={a.type} className={`rounded-lg border p-3 text-sm ${a.severity === 'high' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`} role="alert">
      <div className="font-bold">⚠️ {a.title}</div><div>{a.message}</div>
    </div>
  ));
}

export default function WeatherCard({ path, compact = false, title = 'Weather' }) {
  const { loading, data, error } = useWeather(path);
  if (loading) return <div className="card"><Spinner label="Loading weather…" /></div>;
  if (error) return <div className="card text-sm text-gray-600"><div className="mb-1 font-semibold">⛅ {title}</div>{error}</div>;
  const { weather: w, alerts } = data;
  const c = w.current;
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">{title} · {[w.location.name, w.location.region].filter(Boolean).join(', ')}</div>
          <div className="flex items-center gap-3"><span className="text-5xl">{icon(c.condition)}</span><div><div className="text-4xl font-bold">{Math.round(c.tempC)}°C</div><div className="text-gray-600">{c.condition}</div></div></div>
        </div>
        <div className="rounded-xl bg-sky-50 px-3 py-2 text-center"><div className="text-xs text-sky-700">Chance of rain today</div><div className="text-2xl font-bold text-sky-800">{c.rainChance ?? '–'}%</div></div>
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat l="Feels like" v={`${Math.round(c.feelsLikeC)}°C`} /><Stat l="Humidity" v={`${c.humidity}%`} /><Stat l="Wind" v={`${Math.round(c.windKph)} km/h`} /><Stat l="Cloud cover" v={`${c.cloud}%`} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {w.forecast.slice(0, compact ? 3 : 5).map((d) => (
          <div key={d.date} className="rounded-lg border border-gray-200 p-2 text-center text-sm">
            <div className="font-semibold">{d.label}</div><div className="text-2xl">{icon(d.condition)}</div>
            <div>{Math.round(d.maxC)}° / {Math.round(d.minC)}°</div>
            <div className="text-sky-700">💧 {d.chanceOfRain}%</div>
          </div>
        ))}
      </div>
      <WeatherAlerts alerts={alerts} />
      {w.stale && <p className="text-xs text-amber-700">Live weather is unavailable; showing the last saved forecast.</p>}
      <p className="text-xs text-gray-400">{w.cached ? 'Cached' : 'Live'} · updated {new Date(w.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  );
}
const Stat = ({ l, v }) => <div className="rounded-lg bg-gray-50 p-2"><div className="text-xs text-gray-500">{l}</div><div className="font-semibold">{v}</div></div>;
