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

function isDue(task) {
  if (task.frequencyDays === 0) return !task.lastDoneDate;
  if (!task.lastDoneDate) return true;
  const elapsed = (Date.now() - task.lastDoneDate) / 86400000;
  return elapsed >= task.frequencyDays;
}

function daysUntil(task) {
  if (!task.lastDoneDate || task.frequencyDays === 0) return 0;
  const next = task.lastDoneDate + task.frequencyDays * 86400000;
  return Math.ceil((next - Date.now()) / 86400000);
}

export default function Home() {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [name, setName]         = useState('');
  const [date, setDate]         = useState('');
  const [freq, setFreq]         = useState(7);
  const [category, setCategory] = useState('');
  const [icalUrl, setIcalUrl]   = useState('');

  useEffect(() => {
    setDate(new Date().toISOString().split('T')[0]);
    setIcalUrl(window.location.origin + '/api/ical');
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => { setTasks(data); setLoading(false); });
  }, []);

  const addTask = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), startDate: date, frequencyDays: Number(freq), category: category.trim() })
    });
    const newTask = await res.json();
    setTasks(prev => [...prev, newTask]);
    setName('');
    setCategory('');
    setDate(new Date().toISOString().split('T')[0]);
    setFreq(7);
    setShowForm(false);
    setSaving(false);
  };

  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id);
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

  const sorted = [...tasks].sort((a, b) => isDue(b) - isDue(a));
  const dueCount = tasks.filter(isDue).length;

  return (
    <>
      <Head>
        <title>Tâches récurrentes</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ maxWidth: 620, margin: '0 auto', padding: '2.5rem 1.25rem 5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: '1.5rem', borderBottom: '0.5px solid #ccc' }}>
          <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Tâches
          </h1>
          <button
            onClick={copyIcal}
            style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 12px', background: 'none', color: '#888', border: '0.5px solid #ccc', cursor: 'pointer' }}
          >
            Copier lien iCal
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div style={{ border: '0.5px solid #ccc', padding: '1.25rem', marginTop: '1.25rem', background: '#fff' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '1rem' }}>
              Nouvelle tâche
            </p>
            <div style={{ marginBottom: 10 }}>
              <p style={labelStyle}>Intitulé</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="ex. Passer l'aspirateur"
                autoFocus
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <p style={labelStyle}>Date de départ</p>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <p style={labelStyle}>Fréquence</p>
                <select value={freq} onChange={e => setFreq(e.target.value)}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <p style={labelStyle}>Catégorie <span style={{ color: '#bbb' }}>(optionnel)</span></p>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="ex. Ménage, Achats, Admin…"
                list="categories"
              />
              <datalist id="categories">
                {[...new Set(tasks.filter(t => t.category).map(t => t.category))].map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTask} disabled={saving} style={btnPrimaryStyle}>
                {saving ? 'Ajout…' : 'Ajouter'}
              </button>
              <button onClick={() => setShowForm(false)} style={btnSecondaryStyle}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Task list */}
        <div style={{ marginTop: 0 }}>
          {loading && (
            <p style={{ padding: '3rem 0', textAlign: 'center', fontSize: 12, color: '#888', letterSpacing: '0.04em' }}>
              Chargement…
            </p>
          )}
          {!loading && tasks.length === 0 && (
            <p style={{ padding: '3rem 0', textAlign: 'center', fontSize: 12, color: '#aaa', letterSpacing: '0.04em' }}>
              Aucune tâche — ajoutez-en une
            </p>
          )}
          {sorted.map(task => {
            const due = isDue(task);
            const days = daysUntil(task);
            return (
              <div
                key={task.id}
                style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto auto auto', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '0.5px solid #e5e5e5' }}
              >
                {/* Checkbox */}
                <div
                  onClick={() => toggleDone(task.id)}
                  style={{ width: 14, height: 14, border: '0.5px solid ' + (due ? '#ccc' : '#111'), background: due ? '#f8f8f6' : '#111', cursor: 'pointer', flexShrink: 0 }}
                />
                {/* Name + category */}
                <div>
                  <span style={{ fontSize: 13, color: due ? '#111' : '#aaa', textDecoration: due ? 'none' : 'line-through', textDecorationThickness: '0.5px' }}>
                    {task.name}
                  </span>
                  {task.category && (
                    <span style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb' }}>
                      {task.category}
                    </span>
                  )}
                </div>
                {/* Frequency */}
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', border: '0.5px solid #e5e5e5', padding: '2px 6px' }}>
                  {FREQ_LABELS[task.frequencyDays] || `${task.frequencyDays}j`}
                </span>
                {/* Status */}
                {due
                  ? <span style={{ fontSize: 11, color: '#c0392b', letterSpacing: '0.04em' }}>À faire</span>
                  : <span style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.04em' }}>
                      {task.frequencyDays === 0 ? 'Fait' : `dans ${days}j`}
                    </span>
                }
                {/* Delete */}
                <button
                  onClick={() => deleteTask(task.id)}
                  style={{ fontSize: 16, background: 'none', border: 'none', color: '#ccc', padding: '0 2px', lineHeight: 1, cursor: 'pointer' }}
                  onMouseEnter={e => e.target.style.color = '#c0392b'}
                  onMouseLeave={e => e.target.style.color = '#ccc'}
                >
                  ×
                </button>
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
            <button
              onClick={() => setShowForm(v => !v)}
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'none', border: 'none', color: showForm ? '#111' : '#888', cursor: 'pointer' }}
            >
              {showForm ? '× Fermer' : '+ Nouvelle tâche'}
            </button>
          </div>
        )}

      </main>
    </>
  );
}

const labelStyle = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 4 };
const btnPrimaryStyle = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '7px 16px', background: '#111', color: '#fff', border: 'none', cursor: 'pointer' };
const btnSecondaryStyle = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 12px', background: 'none', color: '#888', border: '0.5px solid #ccc', cursor: 'pointer' };
