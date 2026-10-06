import { useState } from 'react';
import { del, errorMessage, get, post, put } from '../../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Table, fmtDate, useLoad } from '../../components/ui.jsx';

function CategoryForm({ item, onClose, onSaved }) {
  const [f, setF] = useState({ name: item?.name || '', description: item?.description || '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { if (item) await put(`/admin/crop-categories/${item.id}`, f); else await post('/admin/crop-categories', f); onSaved(); } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal title={item ? 'Edit category' : 'Add crop category'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3"><ErrorBox message={error} />
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <button className="btn-primary w-full">Save</button></form>
    </Modal>
  );
}

function LocationForm({ item, onClose, onSaved }) {
  const [f, setF] = useState({ district: item?.district || '', state: item?.state || '', country: item?.country || 'India', latitude: item?.latitude ?? '', longitude: item?.longitude ?? '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { if (item) await put(`/admin/locations/${item.id}`, f); else await post('/admin/locations', f); onSaved(); } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal title={item ? 'Edit location' : 'Add location'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3"><ErrorBox message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="District"><input className="input" value={f.district} onChange={set('district')} required /></Field>
          <Field label="State"><input className="input" value={f.state} onChange={set('state')} required /></Field>
          <Field label="Country"><input className="input" value={f.country} onChange={set('country')} /></Field>
          <span />
          <Field label="Latitude"><input className="input" type="number" step="any" value={f.latitude} onChange={set('latitude')} /></Field>
          <Field label="Longitude"><input className="input" type="number" step="any" value={f.longitude} onChange={set('longitude')} /></Field>
        </div>
        <button className="btn-primary w-full">Save</button></form>
    </Modal>
  );
}

export default function AdminCrops() {
  const cats = useLoad(() => get('/admin/crop-categories'));
  const locs = useLoad(() => get('/admin/locations'));
  const crops = useLoad(() => get('/admin/crops'));
  const [catForm, setCatForm] = useState(null);
  const [locForm, setLocForm] = useState(null);
  const [err, setErr] = useState('');
  const remove = async (path, name, reload) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    setErr(''); try { await del(path); reload(); } catch (e) { setErr(errorMessage(e)); }
  };
  const catCols = [
    { header: 'Category', render: (c) => <b>{c.name}</b> }, { header: 'Description', render: (c) => c.description || '–' }, { header: 'Crops', key: 'crops' },
    { header: '', render: (c) => <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setCatForm(c)}>Edit</button><button className="btn-danger btn-sm" onClick={() => remove(`/admin/crop-categories/${c.id}`, c.name, cats.reload)}>Delete</button></div> },
  ];
  const locCols = [
    { header: 'District', render: (l) => <b>{l.district}</b> }, { header: 'State', key: 'state' }, { header: 'Country', key: 'country' },
    { header: 'Coordinates', render: (l) => (l.latitude != null ? `${l.latitude}, ${l.longitude}` : '–') },
    { header: '', render: (l) => <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setLocForm(l)}>Edit</button><button className="btn-danger btn-sm" onClick={() => remove(`/admin/locations/${l.id}`, l.district, locs.reload)}>Delete</button></div> },
  ];
  const cropCols = [
    { header: 'Crop', render: (c) => <b>{c.crop_name}{c.variety ? ` (${c.variety})` : ''}</b> }, { header: 'Category', render: (c) => c.category || '–' },
    { header: 'Farmer', key: 'farmer_name' }, { header: 'Area', render: (c) => c.area ?? '–' }, { header: 'Sown', render: (c) => fmtDate(c.sowing_date) }, { header: 'Harvest', render: (c) => fmtDate(c.expected_harvest_date) },
  ];
  const section = (title, state, add, cols, rowsKey) => (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold text-leaf-900">{title}</h2>{add && <button className="btn-primary btn-sm" onClick={add}>+ Add</button>}</div>
      {state.loading && !state.data ? <Spinner /> : <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && (state.data[rowsKey].length === 0 ? <Empty title="Nothing here yet" /> : <Table columns={cols} rows={state.data[rowsKey]} />)}
    </section>
  );
  return (
    <>
      <PageHeader title="Crops & locations" subtitle="Categories and locations feed the farmer forms. Crops are added by farmers." />
      <ErrorBox message={err} />
      {section('Crop categories', cats, () => setCatForm({}), catCols, 'categories')}
      {section('Locations', locs, () => setLocForm({}), locCols, 'locations')}
      {section('All farmer crops', crops, null, cropCols, 'crops')}
      {catForm && <CategoryForm item={catForm.id ? catForm : null} onClose={() => setCatForm(null)} onSaved={() => { setCatForm(null); cats.reload(); }} />}
      {locForm && <LocationForm item={locForm.id ? locForm : null} onClose={() => setLocForm(null)} onSaved={() => { setLocForm(null); locs.reload(); }} />}
    </>
  );
}
