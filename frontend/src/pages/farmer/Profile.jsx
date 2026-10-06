import { useEffect, useState } from 'react';
import { errorMessage, get, put } from '../../api/client.js';
import { ErrorBox, Field, PageHeader, Spinner, useLoad } from '../../components/ui.jsx';

export default function FarmerProfile() {
  const { data, loading, error } = useLoad(() => get('/farmers/me'));
  const locs = useLoad(() => get('/farmers/locations'));
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => { if (data) { const p = data.profile; setF({ name: p.name || '', mobile: p.mobile || '', village: p.village || '', district: p.district || '', state: p.state || '', country: p.country || 'India', latitude: p.latitude ?? '', longitude: p.longitude ?? '', farm_size: p.farm_size ?? '', farm_size_unit: p.farm_size_unit || 'acre', soil_type: p.soil_type || '', irrigation_type: p.irrigation_type || '' }); } }, [data]);
  if (loading || !f) return error ? <ErrorBox message={error} /> : <Spinner />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickLocation = (value) => {
    const l = (locs.data ? locs.data.locations : []).find((x) => `${x.district}, ${x.state}` === value);
    if (l) setF({ ...f, district: l.district, state: l.state, country: l.country, latitude: l.latitude ?? f.latitude, longitude: l.longitude ?? f.longitude });
  };

  // Browser geolocation only runs when the farmer taps the button; it is optional and never forced.
  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr('Your browser does not support location.');
    setGeoBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF((s) => ({ ...s, latitude: pos.coords.latitude.toFixed(5), longitude: pos.coords.longitude.toFixed(5) })); setGeoBusy(false); },
      () => { setErr('Location permission was not granted. You can type your village and district instead.'); setGeoBusy(false); },
      { timeout: 10000 }
    );
  };

  const save = async (e) => {
    e.preventDefault(); setMsg(''); setErr('');
    try { await put('/farmers/me', f); setMsg('Profile saved ✔'); } catch (er) { setErr(errorMessage(er)); }
  };

  return (
    <>
      <PageHeader title="My profile & location" />
      <form onSubmit={save} className="space-y-5">
        <ErrorBox message={err} />{msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{msg}</div>}
        <div className="card grid gap-4 sm:grid-cols-2">
          <h2 className="font-bold text-leaf-900 sm:col-span-2">About me</h2>
          <Field label="Name"><input className="input" value={f.name} onChange={set('name')} required /></Field>
          <Field label="Mobile"><input className="input" value={f.mobile} onChange={set('mobile')} required /></Field>
        </div>
        <div className="card grid gap-4 sm:grid-cols-2">
          <h2 className="font-bold text-leaf-900 sm:col-span-2">Location (used for weather)</h2>
          <Field label="Quick select"><input className="input" list="locs" placeholder="Type to search districts…" onChange={(e) => pickLocation(e.target.value)} />
            <datalist id="locs">{(locs.data ? locs.data.locations : []).map((l) => <option key={l.id} value={`${l.district}, ${l.state}`} />)}</datalist></Field>
          <div className="flex items-end"><button type="button" className="btn-secondary w-full" onClick={useMyLocation} disabled={geoBusy}>{geoBusy ? 'Getting location…' : '📍 Use my current location'}</button></div>
          <Field label="Village"><input className="input" value={f.village} onChange={set('village')} /></Field>
          <Field label="District"><input className="input" value={f.district} onChange={set('district')} /></Field>
          <Field label="State"><input className="input" value={f.state} onChange={set('state')} /></Field>
          <Field label="Country"><input className="input" value={f.country} onChange={set('country')} /></Field>
          <Field label="Latitude" hint="Optional, gives a more accurate forecast"><input className="input" value={f.latitude} onChange={set('latitude')} inputMode="decimal" /></Field>
          <Field label="Longitude"><input className="input" value={f.longitude} onChange={set('longitude')} inputMode="decimal" /></Field>
          <p className="text-xs text-gray-500 sm:col-span-2">If you leave latitude/longitude empty, weather is looked up from your village, district and state.</p>
        </div>
        <div className="card grid gap-4 sm:grid-cols-2">
          <h2 className="font-bold text-leaf-900 sm:col-span-2">My farm</h2>
          <Field label="Total farm size"><input type="number" step="0.01" min="0" className="input" value={f.farm_size} onChange={set('farm_size')} /></Field>
          <Field label="Unit"><select className="input" value={f.farm_size_unit} onChange={set('farm_size_unit')}><option>acre</option><option>hectare</option><option>bigha</option></select></Field>
          <Field label="Soil type"><input className="input" value={f.soil_type} onChange={set('soil_type')} /></Field>
          <Field label="Irrigation type"><input className="input" value={f.irrigation_type} onChange={set('irrigation_type')} /></Field>
        </div>
        <button className="btn-primary px-8 py-3">Save</button>
      </form>
    </>
  );
}
