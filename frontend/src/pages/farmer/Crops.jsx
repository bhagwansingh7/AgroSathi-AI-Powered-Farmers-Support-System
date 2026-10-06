import { useState } from 'react';
import { del, errorMessage, get, post, put } from '../../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Spinner, fmtDate, useLoad } from '../../components/ui.jsx';

const dateVal = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function CropForm({ crop, farms, categories, onClose, onSaved }) {
  const [f, setF] = useState({ crop_name: crop?.crop_name || '', variety: crop?.variety || '', farm_id: crop?.farm_id || '', category_id: crop?.category_id || '', sowing_date: dateVal(crop?.sowing_date), expected_harvest_date: dateVal(crop?.expected_harvest_date), area: crop?.area ?? '', soil_type: crop?.soil_type || '', irrigation_type: crop?.irrigation_type || '', notes: crop?.notes || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { crop ? await put(`/crops/${crop.id}`, f) : await post('/crops', f); onSaved(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title={crop ? 'Edit crop' : 'Add a crop'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Crop name (e.g. Wheat)"><input className="input" value={f.crop_name} onChange={set('crop_name')} required minLength={2} /></Field>
          <Field label="Variety"><input className="input" value={f.variety} onChange={set('variety')} /></Field>
          <Field label="Category"><select className="input" value={f.category_id} onChange={set('category_id')}><option value="">Select…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Which farm / plot?"><select className="input" value={f.farm_id} onChange={set('farm_id')}><option value="">Not specified</option>{farms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Sowing date"><input type="date" className="input" value={f.sowing_date} onChange={set('sowing_date')} /></Field>
          <Field label="Expected harvest date"><input type="date" className="input" value={f.expected_harvest_date} onChange={set('expected_harvest_date')} /></Field>
          <Field label="Area (acres)"><input type="number" step="0.01" min="0" className="input" value={f.area} onChange={set('area')} /></Field>
          <Field label="Soil type"><input className="input" value={f.soil_type} onChange={set('soil_type')} /></Field>
          <Field label="Irrigation"><input className="input" value={f.irrigation_type} onChange={set('irrigation_type')} /></Field>
        </div>
        <Field label="Notes (problems you noticed, fertilizer used…)"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save crop'}</button>
      </form>
    </Modal>
  );
}

function FarmForm({ farm, onClose, onSaved }) {
  const [f, setF] = useState({ name: farm?.name || '', area: farm?.area ?? '', area_unit: farm?.area_unit || 'acre', soil_type: farm?.soil_type || '', irrigation_type: farm?.irrigation_type || '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); try { farm ? await put(`/farms/${farm.id}`, f) : await post('/farms', f); onSaved(); } catch (err) { setError(errorMessage(err)); } };
  return (
    <Modal title={farm ? 'Edit farm' : 'Add a farm / plot'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3"><ErrorBox message={error} />
        <Field label="Name (e.g. Main field)"><input className="input" value={f.name} onChange={set('name')} required /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Area"><input type="number" step="0.01" min="0" className="input" value={f.area} onChange={set('area')} /></Field>
          <Field label="Unit"><select className="input" value={f.area_unit} onChange={set('area_unit')}><option>acre</option><option>hectare</option><option>bigha</option></select></Field></div>
        <Field label="Soil type"><input className="input" value={f.soil_type} onChange={set('soil_type')} /></Field>
        <Field label="Irrigation"><input className="input" value={f.irrigation_type} onChange={set('irrigation_type')} /></Field>
        <button className="btn-primary w-full">Save farm</button></form>
    </Modal>
  );
}

export default function FarmerCrops() {
  const crops = useLoad(() => get('/crops'));
  const farms = useLoad(() => get('/farms'));
  const cats = useLoad(() => get('/crops/categories'));
  const [cropModal, setCropModal] = useState(null); // {} for new, crop for edit
  const [farmModal, setFarmModal] = useState(null);
  const [error, setError] = useState('');
  const reloadAll = () => { crops.reload(); farms.reload(); };
  const remove = async (kind, id) => {
    if (!window.confirm(`Delete this ${kind}?`)) return;
    try { await del(`/${kind === 'crop' ? 'crops' : 'farms'}/${id}`); reloadAll(); } catch (e) { setError(errorMessage(e)); }
  };
  if (crops.loading && !crops.data) return <Spinner />;
  const list = crops.data ? crops.data.crops : [];
  const farmList = farms.data ? farms.data.farms : [];
  return (
    <>
      <PageHeader title="My crops" subtitle="Keeping this up to date helps the AI and your agent give better advice." actions={<button className="btn-primary" onClick={() => setCropModal({})}>+ Add crop</button>} />
      <ErrorBox message={error || crops.error} onRetry={crops.reload} />
      {list.length === 0 ? <Empty icon="🌾" title="No crops added yet" hint="Add wheat, soybean, mustard… whatever you grow."><button className="btn-primary" onClick={() => setCropModal({})}>+ Add your first crop</button></Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="card space-y-1">
              <div className="flex items-start justify-between"><div className="text-lg font-bold text-leaf-900">{c.crop_name}</div><span className="text-xs text-gray-500">{c.category}</span></div>
              {c.variety && <div className="text-sm text-gray-600">Variety: {c.variety}</div>}
              <div className="text-sm">Sown: {fmtDate(c.sowing_date)} · Harvest: {fmtDate(c.expected_harvest_date)}</div>
              <div className="text-sm text-gray-600">{c.farm_name ? `Plot: ${c.farm_name} · ` : ''}{c.area ? `${c.area} acre` : ''}</div>
              {c.notes && <div className="rounded bg-amber-50 p-2 text-xs text-amber-900">{c.notes}</div>}
              <div className="flex gap-2 pt-2"><button className="btn-secondary btn-sm" onClick={() => setCropModal(c)}>Edit</button><button className="btn-secondary btn-sm text-red-700" onClick={() => remove('crop', c.id)}>Delete</button></div>
            </div>
          ))}
        </div>
      )}
      <div className="mb-3 mt-8 flex items-center justify-between"><h2 className="text-xl font-bold text-leaf-900">My farms / plots</h2><button className="btn-secondary btn-sm" onClick={() => setFarmModal({})}>+ Add farm</button></div>
      {farmList.length === 0 ? <p className="text-sm text-gray-500">No farms added. Optional: group crops by field.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{farmList.map((f) => (
          <div key={f.id} className="card text-sm"><div className="font-bold">{f.name}</div><div className="text-gray-600">{f.area ? `${f.area} ${f.area_unit}` : 'Area not set'} · {f.soil_type || 'Soil not set'} · {f.irrigation_type || 'Irrigation not set'}</div>
            <div className="mt-2 flex gap-2"><button className="btn-secondary btn-sm" onClick={() => setFarmModal(f)}>Edit</button><button className="btn-secondary btn-sm text-red-700" onClick={() => remove('farm', f.id)}>Delete</button></div></div>
        ))}</div>
      )}
      {cropModal && <CropForm crop={cropModal.id ? cropModal : null} farms={farmList} categories={cats.data ? cats.data.categories : []} onClose={() => setCropModal(null)} onSaved={() => { setCropModal(null); reloadAll(); }} />}
      {farmModal && <FarmForm farm={farmModal.id ? farmModal : null} onClose={() => setFarmModal(null)} onSaved={() => { setFarmModal(null); reloadAll(); }} />}
    </>
  );
}
