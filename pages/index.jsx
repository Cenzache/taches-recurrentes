import { useState, useEffect } from 'react';
import Head from 'next/head';

const FREQ_LABELS = { 0: 'Ponctuelle', 7: 'Hebdo', 14: 'Bi-mensuel', 30: 'Mensuel', 42: '6 semaines', 90: 'Trimestriel' };
const FREQ_OPTIONS = [
  { value: 0,  label: 'Ponctuelle' },
  { value: 7,  label: 'Hebdo — 7 jours' },
  { value: 14, label: 'Bi-mensuel — 14 jours' },
  { value: 30, label: 'Mensuel — 30 jours' },
  { value: 42, label: '6 semaines — 42 jours' },
  { value: 90, label: 'Trimestriel — 90 jours' },
];
const ALERT_OPTIONS = [
  { value: 7,  label: '1 semaine avant' },
  { value: 14, label: '2 semaines avant' },
  { value: 21, label: '3 semaines avant' },
  { value: 30, label: '1 mois avant' },
  { value: 60, label: '2 mois avant' },
  { value: 90, label: '3 mois avant' },
];

// 'due' | 'standby' | 'ok' | 'done'
function getStatus(task) {
  if (task.frequencyDays !== 0) {
    if (!task.lastDoneDate) return 'due';
    const elapsed = (Date.now() - task.lastDoneDate) / 86400000;
    return elapsed >= task.frequencyDays ? 'due' : 'ok';
  }
  // Ponctuelle
  if (task.lastDoneDate) return 'done';
  const taskDate = new Date(task.startDate + 'T00:00:00');
  const alertDate = new Date(taskDate.getTime() - (task.alertDays || 21) * 86400000);
  return new Date() >= alertDate ? 'due' : 'standby';
}

function isDue(task) {
  const s = getStatus(task);
  return s === 'due';
}

function nextDueDate(task) {
  if (task.frequencyDays === 0) return task.startDate;
  if (!task.lastDoneDate) return task.startDate;
  const next = new Date(task.lastDoneDate + task.frequencyDays * 86400000);
  return next.toISOString().split('T')[0];
}

function overdueScore(task) {
  if (task.frequencyDays === 0) {
    return (Date.now() - new Date(task.startDate + 'T00:00:00').getTime()) / 86400000;
  }
  if (!task.lastDoneDate) {
    return (Date.now() - new Date(task.startDate + 'T00:00:00').getTime()) / 86400000;
  }
  return (Date.now() - task.lastDoneDate) / 86400000 - task.frequencyDays;
}

function sortByUrgency(tasks) {
  const order = { due: 0, standby: 1, ok: 2, done: 3 };
  return [...tasks].sort((a, b) => {
    const sA = getStatus(a), sB = getStatus(b);
    if (order[sA] !== order[sB]) return order[sA] - order[sB];
    if (sA === 'due' && sB === 'due') return overdueScore(b) - overdueScore(a);
    return new Date(nextDueDate(a)) - new Date(nextDueDate(b));
  });
}

function formatDateFR(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const emptyForm = { name: '', category: '', freq: 7, date: '', alertDays: 21 };

export default function Home() {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [icalUrl, setIcalUrl]     = useState('');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setForm(f => ({ ...f, date: today }));
    setIcalUrl(window.location.origin + '/api/ical');
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => { setTasks(data); setLoading(false); });
  }, []);

  const addTask = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        startDate: form.date,
        frequencyDays: Number(form.freq),
        category: form.category.trim(),
        alertDays: Number(form.alertDays),
      })
    });
    const newTask = await res.json();
    setTasks(prev => [...prev, newTask]);
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] });
    setShowForm(false);
    setSaving(false);
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditForm({
      name: task.name,
      category: task.category || '',
      freq: task.frequencyDays,
      date: task.startDate,
      alertDays: task.alertDays || 21,
    });
  };

  const saveEdit = async (id) => {
    const updated = {
      name: editForm.name.trim(),
      category: editForm.category.trim(),
      frequencyDays: Number(editForm.freq),
      startDate: editForm.date,
      alertDays: Number(editForm.alertDays),
    };
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
    setEditingId(null);
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updated })
    });
  };

  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (getStatus(task) === 'standby') return; // pas cochable en stand by
    const newLastDone = isDue(task) ? Date.now() : null;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, lastDoneDate: newLastDone } : t));
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, lastDoneDate: newLastDone })
    });
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  };

  const copyIcal = () => {
    navigator.clipboard.writeText(icalUrl);
    alert('URL copiée — colle-la dans Apple Calendar > Fichier > Nouvel abonnement calendrier');
  };

  const allCategories = [...new Set(tasks.filter(t => t.category).map(t => t.category))];
  const sorted = sortByUrgency(tasks);
  const dueCount = tasks.filter(isDue).length;

  const statusStyle = {
    due:     { color: '#c0392b' },
    standby: { color: '#bbb' },
    ok:      { color: '#aaa' },
    done:    { color: '#aaa' },
  };
  const statusLabel = { due: 'À faire', standby: 'Stand by', ok: 'OK', done: 'Fait' };

  return (
    <>
      <Head>
        <title>Tâches récurrentes</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ maxWidth: 660, margin: '0 auto', padding: '2.5rem 1.25rem 5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: '1.5rem', borderBottom: '0.5px solid #ccc' }}>
          <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Tâches
          </h1>
          <button onClick={copyIcal} style={btnSecondaryStyle}>Copier lien iCal</button>
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{ border: '0.5px solid #ccc', padding: '1.25rem', marginTop: '1.25rem', background: '#fff' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '1rem' }}>
              Nouvelle tâche
            </p>
            <div style={{ marginBottom: 10 }}>
              <p style={labelStyle}>Intitulé</p>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="ex. Passer l'aspirateur" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <p style={labelStyle}>{Number(form.freq) === 0 ? 'Date prévue' : 'Date de départ'}</p>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <p style={labelStyle}>Fréquence</p>
                <select value={form.freq} onChange={e => setForm(f => ({ ...f, freq: e.target.value }))}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {Number(form.freq) === 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={labelStyle}>Me rappeler</p>
                <select value={form.alertDays} onChange={e => setForm(f => ({ ...f, alertDays: e.target.value }))}>
                  {ALERT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <p style={labelStyle}>Catégorie <span style={{ color: '#bbb' }}>(optionnel)</span></p>
              <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="ex. Ménage, Achats, Admin…" list="cat-list" />
              <datalist id="cat-list">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTask} disabled={saving} style={btnPrimaryStyle}>{saving ? 'Ajout…' : 'Ajouter'}</button>
              <button onClick={() => setShowForm(false)} style={btnSecondaryStyle}>Annuler</button>
            </div>
          </div>
        )}

        {/* Task list */}
        <div style={{ marginTop: 0 }}>
          {loading && <p style={emptyStyle}>Chargement…</p>}
          {!loading && tasks.length === 0 && <p style={emptyStyle}>Aucune tâche — ajoutez-en une</p>}

          {sorted.map(task => {
            const status = getStatus(task);
            const nextDate = nextDueDate(task);
            const isEditing = editingId === task.id;
            const isStandby = status === 'standby';
            const isDone = status === 'done' || status === 'ok';

            if (isEditing) {
              return (
                <div key={task.id} style={{ padding: '12px 0', borderBottom: '0.5px solid #e5e5e5', background: '#fafaf8' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <p style={labelStyle}>Intitulé</p>
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(task.id)} autoFocus />
                    </div>
                    <div>
                      <p style={labelStyle}>Catégorie</p>
                      <input type="text" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                        list="cat-list" placeholder="Ménage, Achats…" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <p style={labelStyle}>{Number(editForm.freq) === 0 ? 'Date prévue' : 'Date de départ'}</p>
                      <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div>
                      <p style={labelStyle}>Fréquence</p>
                      <select value={editForm.freq} onChange={e => setEditForm(f => ({ ...f, freq: e.target.value }))}>
                        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {Number(editForm.freq) === 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <p style={labelStyle}>Me rappeler</p>
                      <select value={editForm.alertDays} onChange={e => setEditForm(f => ({ ...f, alertDays: e.target.value }))}>
                        {ALERT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => saveEdit(task.id)} style={btnPrimaryStyle}>Enregistrer</button>
                    <button onClick={() => setEditingId(null)} style={btnSecondaryStyle}>Annuler</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto auto auto auto', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '0.5px solid #e5e5e5', opacity: isStandby ? 0.45 : 1 }}>
                {/* Checkbox */}
                <div onClick={() => !isStandby && toggleDone(task.id)}
                  style={{
                    width: 14, height: 14,
                    border: isStandby ? '0.5px dashed #bbb' : '0.5px solid ' + (isDone ? '#111' : '#ccc'),
                    background: isDone ? '#111' : '#f8f8f6',
                    cursor: isStandby ? 'default' : 'pointer',
                    flexShrink: 0,
                  }} />

                {/* Name + category + date */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, color: isDone ? '#aaa' : '#111', textDecoration: isDone ? 'line-through' : 'none', textDecorationThickness: '0.5px' }}>
                      {task.name}
                    </span>
                    {task.category && (
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ccc' }}>
                        {task.category}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 2, letterSpacing: '0.03em' }}>
                    {task.frequencyDays === 0
                      ? `Prévu le ${formatDateFR(nextDate)}`
                      : `Prochaine échéance : ${formatDateFR(nextDate)}`
                    }
                  </div>
                </div>

                {/* Frequency badge */}
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', border: '0.5px solid #e5e5e5', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                  {FREQ_LABELS[task.frequencyDays] || `${task.frequencyDays}j`}
                </span>

                {/* Status */}
                <span style={{ fontSize: 11, letterSpacing: '0.04em', whiteSpace: 'nowrap', ...statusStyle[status] }}>
                  {statusLabel[status]}
                </span>

                {/* Edit */}
                <button onClick={() => startEdit(task)}
                  style={{ fontSize: 11, background: 'none', border: 'none', color: '#ccc', padding: '0 2px', cursor: 'pointer' }}
                  onMouseEnter={e => e.target.style.color = '#111'}
                  onMouseLeave={e => e.target.style.color = '#ccc'}>✎</button>

                {/* Delete */}
                <button onClick={() => deleteTask(task.id)}
                  style={{ fontSize: 16, background: 'none', border: 'none', color: '#ccc', padding: '0 2px', lineHeight: 1, cursor: 'pointer' }}
                  onMouseEnter={e => e.target.style.color = '#c0392b'}
                  onMouseLeave={e => e.target.style.color = '#ccc'}>×</button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa' }}>
              {tasks.length > 0 ? `${dueCount} à faire · ${tasks.length} total` : ''}
            </span>
            <button onClick={() => setShowForm(v => !v)}
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'none', border: 'none', color: showForm ? '#111' : '#888', cursor: 'pointer' }}>
              {showForm ? '× Fermer' : '+ Nouvelle tâche'}
            </button>
          </div>
        )}

      </main>
    </>
  );
}

const labelStyle        = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 4 };
const emptyStyle        = { padding: '3rem 0', textAlign: 'center', fontSize: 12, color: '#aaa', letterSpacing: '0.04em' };
const btnPrimaryStyle   = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '7px 16px', background: '#111', color: '#fff', border: 'none', cursor: 'pointer' };
const btnSecondaryStyle = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 12px', background: 'none', color: '#888', border: '0.5px solid #ccc', cursor: 'pointer' };
