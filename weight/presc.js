/**
 * PRESC Weight Competition — shared utilities
 * Used by index.html, chart.html, and setup.html
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

/* ── Firebase bootstrap ─────────────────────────────── */

const firebaseConfig = window.firebaseConfig;
if (!firebaseConfig || !firebaseConfig.projectId) {
  document.body.innerHTML =
    '<p style="color:#ff7b7b;text-align:center;margin-top:40vh">' +
    'Firebase config could not be loaded.<br>Please try refreshing the page.' +
    '</p>';
  throw new Error('firebase-config.js missing or empty');
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/* ── Constants ──────────────────────────────────────── */

export const USERS   = ['Jay', 'Sarah'];
export const COLORS  = { Jay: '#2196f3', Sarah: '#ff69b4' };
const MS_PER_WEEK    = 7 * 86_400_000;

/* ── Date helpers (Monday = weigh day) ──────────────── */

export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();                       // 0 = Sun … 6 = Sat
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekKey(date) {
  return getMonday(date).toISOString().slice(0, 10);
}

/* ── Firestore helpers ──────────────────────────────── */

export async function saveWeight(user, startKg, todayKg, changePct, date) {
  await addDoc(collection(db, 'weightData'), {
    user, date, startWeight: startKg, todayWeight: todayKg, changePct
  });
}

export async function loadStartingWeight(user) {
  if (!user) return null;
  const snap = await getDocs(
    query(collection(db, 'startingWeight'), where('user', '==', user))
  );
  return snap.empty ? null : snap.docs[0].data().weight;
}

export async function saveStartingWeight(user, weightKg, unit) {
  // Remove previous entry
  const snap = await getDocs(
    query(collection(db, 'startingWeight'), where('user', '==', user))
  );
  for (const doc of snap.docs) await deleteDoc(doc.ref);

  await addDoc(collection(db, 'startingWeight'), {
    user, weight: weightKg, unit, date: new Date().toISOString()
  });
}

/**
 * Load weight data with privacy: only the currentUser sees actual weights.
 * If currentUser is null (chart page), only percentages are returned.
 */
export async function loadWeightData(currentUser = null) {
  const snap = await getDocs(
    query(collection(db, 'weightData'), orderBy('date'))
  );
  return snap.docs.map(doc => {
    const d = doc.data();
    if (currentUser && d.user === currentUser) return d;
    return { user: d.user, date: d.date, changePct: d.changePct };
  });
}

/* ── Weekly competition logic ───────────────────────── */

export function weeklyResults(data) {
  const weeks = {};

  data.forEach(entry => {
    const wk  = weekKey(entry.date);
    const mon = getMonday(entry.date);
    const d   = new Date(entry.date);
    if (d >= mon && d < new Date(mon.getTime() + MS_PER_WEEK)) {
      if (!weeks[wk]) weeks[wk] = {};
      weeks[wk][entry.user] = entry;
    }
  });

  return Object.entries(weeks).map(([wk, users]) => {
    const missing = USERS.filter(u => !users[u]);
    let winner = null;
    if (missing.length === 0) {
      winner = users.Jay.changePct < users.Sarah.changePct ? 'Jay' : 'Sarah';
    }
    return { week: wk, winner, missing };
  });
}

/* ── Chart rendering ────────────────────────────────── */

let chartInstance = null;

export function renderChart(canvasId, data, containerEl) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  // Unique sorted dates
  const dateKeys = [...new Set(data.map(e => e.date.slice(0, 10)))].sort();
  const labels   = dateKeys.map(d => new Date(d).toLocaleDateString());

  const datasets = USERS.map(user => {
    const byDate = {};
    data.filter(e => e.user === user)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(e => { byDate[e.date.slice(0, 10)] = Math.round((100 + e.changePct) * 10) / 10; });

    return {
      label: user,
      data: dateKeys.map(dk => byDate[dk] ?? null),
      borderColor: COLORS[user],
      backgroundColor: user === 'Sarah' ? 'rgba(255,105,180,0.15)' : 'rgba(33,150,243,0.15)',
      tension: 0.35, fill: false, pointRadius: 4, pointHoverRadius: 6
    };
  });

  // Weekly summary HTML
  const results = weeklyResults(data);
  containerEl.querySelectorAll('.weekly-summary').forEach(el => el.remove());

  if (results.length) {
    const html = results.map(({ week, winner, missing }) => {
      if (winner) {
        return `<b>Week of ${week}:</b> Winner: <span style="color:${COLORS[winner]}">${winner}</span>`;
      }
      const names = missing.join(' and ');
      return `<b>Week of ${week}:</b> <span style="color:#ffb300">${names} ha${missing.length > 1 ? 've' : 's'} not entered their weight this week</span>`;
    }).join('<br/>');

    containerEl.insertAdjacentHTML(
      'afterbegin',
      `<div class="weekly-summary note-text" style="margin-bottom:10px">${html}</div>`
    );
  }

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}%` } }
      },
      scales: {
        x: { title: { display: true, text: 'Week' } },
        y: {
          beginAtZero: false, suggestedMin: 90, suggestedMax: 105,
          title: { display: true, text: 'Relative Weight (%)' },
          ticks: { callback: v => `${v}%` }
        }
      }
    }
  });
}

/* ── Unit conversion ────────────────────────────────── */

const ST_TO_KG = 6.35029;
const LB_TO_KG = 0.45359237;

export function parseWeightInputs(unit, ids) {
  if (unit === 'st-lb') {
    const st = parseFloat(document.getElementById(ids.stones).value) || 0;
    const lb = parseFloat(document.getElementById(ids.pounds).value) || 0;
    return st * ST_TO_KG + lb * LB_TO_KG;
  }
  if (unit === 'lb') {
    return (parseFloat(document.getElementById(ids.poundsOnly).value) || 0) * LB_TO_KG;
  }
  return parseFloat(document.getElementById(ids.kg).value) || 0;
}

/* ── Today's date string (YYYY-MM-DD) ───────────────── */

export function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
