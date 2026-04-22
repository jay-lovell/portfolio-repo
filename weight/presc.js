/**
 * PRESC Weight Competition — shared utilities
 * Used by index.html, chart.html, and setup.html
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence,
  browserSessionPersistence, signInWithPopup, signOut
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

/* ── Firebase bootstrap ─────────────────────────────── */

const firebaseConfig = {
  apiKey:            'AIzaSyA4wFvRoHQ3lre4-NO18ogVaSYM_hTohFA',
  authDomain:        'presc-weight.firebaseapp.com',
  projectId:         'presc-weight',
  storageBucket:     'presc-weight.firebasestorage.app',
  messagingSenderId: '77512782350',
  appId:             '1:77512782350:web:afc4eb48ab146d5d9cc25f',
  measurementId:     'G-FXMQXHPT6T',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserSessionPersistence).catch(error => {
  console.error('Unable to set auth persistence:', error);
});

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export function onUserChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ── Constants ──────────────────────────────────────── */

export const USERS   = ['Sarah', 'Jay'];
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

/** Format an ISO date string (or Date) as d/m — no zero-padding */
export function fmtDate(isoStr) {
  const d = new Date(isoStr);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
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

  // Group entries by week; data is ordered by date so last write wins per user per week
  data.forEach(entry => {
    const wk = weekKey(entry.date);
    if (!weeks[wk]) weeks[wk] = {};
    weeks[wk][entry.user] = entry;
  });

  const sortedWeeks = Object.keys(weeks).sort();

  return sortedWeeks.map((wk, i) => {
    const users  = weeks[wk];
    const prevWk = i > 0 ? weeks[sortedWeeks[i - 1]] : null;

    // Weekly delta: changePct this week minus last week = % of starting weight lost this specific week
    // changePct is negative when weight is lost, so a more-negative delta = more lost this week
    const weeklyPct = {};
    USERS.forEach(u => {
      if (users[u]) {
        const prevPct  = prevWk?.[u]?.changePct ?? 0;
        weeklyPct[u]   = users[u].changePct - prevPct;
      }
    });

    const missing = USERS.filter(u => !users[u]);
    let winner = null;
    if (missing.length === 0 && weeklyPct.Jay !== weeklyPct.Sarah) {
      // Lower (more negative) delta = more weight lost this week = winner
      winner = weeklyPct.Jay < weeklyPct.Sarah ? 'Jay' : 'Sarah';
    }

    return { week: wk, winner, missing, weeklyPct };
  });
}

/* ── Chart rendering ────────────────────────────────── */

let chartInstance = null;

export function renderChart(canvasId, data, containerEl) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  // Unique sorted dates
  const dateKeys = [...new Set(data.map(e => e.date.slice(0, 10)))].sort();
  const labels   = dateKeys.map(d => fmtDate(d));

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
  containerEl.querySelectorAll('.weekly-summary').forEach(el => el.remove());

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

/* ── Leaderboard ─────────────────────────────────────── */

export function renderLeaderboard(data, results, containerEl) {
  const wins = { Jay: 0, Sarah: 0 };
  results.forEach(({ winner }) => { if (winner) wins[winner]++; });

  // Total % lost = most recent entry's cumulative changePct per user
  const totalPct = { Jay: 0, Sarah: 0 };
  USERS.forEach(u => {
    const entries = data
      .filter(e => e.user === u)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (entries.length) totalPct[u] = entries[0].changePct;
  });

  const maxWins = Math.max(wins.Jay, wins.Sarah);

  const rows = USERS.map(u => {
    const crown  = maxWins > 0 && wins[u] === maxWins ? ' 👑' : '';
    const pctVal = -(totalPct[u] ?? 0); // positive = lost weight
    return `<tr>
      <td style="color:${COLORS[u]};font-weight:700">${u}${crown}</td>
      <td>${wins[u]}</td>
      <td>${pctVal >= 0 ? '' : '-'}${Math.abs(pctVal).toFixed(2)}%</td>
    </tr>`;
  }).join('');

  containerEl.innerHTML = `
    <p class="note-text" style="margin:0 0 10px">Competition standings</p>
    <table class="leaderboard-table">
      <thead><tr><th>Name</th><th>Weeks Won</th><th>Total % Lost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Weekly bar chart ────────────────────────────────── */

let weeklyChartInstance = null;

export function renderWeeklyBarChart(canvasId, results) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  // Only show weeks where both users have entries
  const completedWeeks = results.filter(r => r.missing.length === 0);
  const labels = completedWeeks.map(r => fmtDate(r.week));

  // Custom plugin: draw a crown emoji above the winning bar each week
  const crownPlugin = {
    id: 'crownPlugin',
    afterDraw(chart) {
      const c = chart.ctx;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        meta.data.forEach((bar, dataIndex) => {
          const week = completedWeeks[dataIndex];
          if (week && week.winner === USERS[datasetIndex]) {
            c.save();
            c.font = '14px serif';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText('👑', bar.x, bar.y - 2);
            c.restore();
          }
        });
      });
    }
  };

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  weeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: USERS.map(u => ({
        label: u,
        data: completedWeeks.map(r =>
          r.weeklyPct[u] !== undefined
            ? Math.round(-r.weeklyPct[u] * 100) / 100  // positive = lost weight
            : null
        ),
        backgroundColor: COLORS[u] + 'aa',
        borderColor:     COLORS[u],
        borderWidth:     2,
        borderRadius:    6,
      }))
    },
    options: {
      responsive: true,
      layout: { padding: { top: 24 } },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}% of start weight lost`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Week of' } },
        y: {
          title: { display: true, text: '% of Start Weight Lost' },
          ticks: { callback: v => `${v}%` }
        }
      }
    },
    plugins: [crownPlugin]
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
