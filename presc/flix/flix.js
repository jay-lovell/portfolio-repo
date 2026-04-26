// ── Firebase ───────────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc }
  from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyA4wFvRoHQ3lre4-NO18ogVaSYM_hTohFA',
  authDomain:        'presc-weight.firebaseapp.com',
  projectId:         'presc-weight',
  storageBucket:     'presc-weight.firebasestorage.app',
  messagingSenderId: '77512782350',
  appId:             '1:77512782350:web:afc4eb48ab146d5d9cc25f',
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const DATA_DOC = doc(db, 'flixData', 'filmList');

// ── TMDB ───────────────────────────────────────────────────────────────────
// Read-only bearer token — safe for client-side TMDB integrations
const TMDB_BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwYTFjOWQ1YTk3Y2M5NmE4ZmM0ZWM3YTJjMzc2MjQ3YyIsIm5iZiI6MTc3NzE5ODU1NC40MjQsInN1YiI6IjY5ZWRlNWRhYThmYTJjYWI4NjAyOTJmOCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.yi8k_TCPd8o5DNeYUNF-agboElywtzbrhy4GUKU5R_I';
const TMDB_IMG   = 'https://image.tmdb.org/t/p/w342';   // full poster stored on film
const TMDB_THUMB = 'https://image.tmdb.org/t/p/w92';    // thumbnail used in dropdown only

// One search call per debounced query; results include poster_path + release_date,
// so no secondary details call is needed.
async function tmdbSearch(query) {
  const params = new URLSearchParams({
    query,
    language:      'en-US',
    page:          '1',
    include_adult: 'false',
  });
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`, {
      headers: { Authorization: `Bearer ${TMDB_BEARER}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 5).map(r => ({
      tmdbId:    r.id,
      title:     r.title,
      year:      r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null,
      posterUrl: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
      thumbUrl:  r.poster_path ? `${TMDB_THUMB}${r.poster_path}` : null,
      genreIds:  r.genre_ids  || [],
    }));
  } catch { return []; }
}

// ── TMDB watch providers (GB only) ────────────────────────────────
// Maps TMDB provider display names → our internal service keys.
// Covers flatrate (streaming) providers only — skip rent/buy.
const TMDB_PROVIDER_MAP = {
  'Netflix':              'Netflix',
  'Amazon Prime Video':   'Amazon Prime',
  'Prime Video':          'Amazon Prime',
  'Apple TV Plus':        'Apple TV+',
  'Apple TV+':            'Apple TV+',
  'Now TV':               'NowTV',
  'Now':                  'NowTV',
  'Paramount+':           'Paramount',
  'BBC iPlayer':          'BBC iPlayer',
  'Disney Plus':          'Disney+',
  'Disney+':              'Disney+',
};

async function tmdbProviders(tmdbId) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`,
      { headers: { Authorization: `Bearer ${TMDB_BEARER}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const gb = (data.results || {}).GB;
    if (!gb) return [];
    const flatrate = gb.flatrate || [];
    return flatrate
      .map(p => TMDB_PROVIDER_MAP[p.provider_name])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  } catch { return []; }
}

// ── TMDB genre list (fetched once at boot) ──────────────────────────
let genreMap = new Map(); // id → name

async function loadGenres() {
  try {
    const res = await fetch('https://api.themoviedb.org/3/genre/movie/list?language=en-US', {
      headers: { Authorization: `Bearer ${TMDB_BEARER}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    genreMap = new Map((data.genres || []).map(g => [g.id, g.name]));
  } catch { /* non-fatal — genre pre-fill just won’t work */ }
}

// ── Film data ──────────────────────────────────────────────────────────────

const DEFAULT_FILMS = [
  { id:  1, title: 'The Shawshank Redemption', year: 1994 },
  { id:  2, title: 'The Godfather',             year: 1972 },
  { id:  3, title: 'The Dark Knight',           year: 2008 },
  { id:  4, title: 'Schindler\'s List',          year: 1993 },
  { id:  5, title: 'Pulp Fiction',              year: 1994 },
  { id:  6, title: 'The Lord of the Rings',     year: 2001 },
  { id:  7, title: 'Forrest Gump',              year: 1994 },
  { id:  8, title: 'Inception',                 year: 2010 },
  { id:  9, title: 'Goodfellas',                year: 1990 },
  { id: 10, title: 'The Silence of the Lambs',  year: 1991 },
  { id: 11, title: 'Interstellar',              year: 2014 },
  { id: 12, title: 'The Matrix',                year: 1999 },
];

// ── Persistence ────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const snap = await getDoc(DATA_DOC);
    if (snap.exists()) {
      const data = snap.data();
      const savedFilms = Array.isArray(data.films) && data.films.length > 0
        ? data.films.map(f => {
            const film = { watched: false, ...f };
            if (film.service && !film.services) {
              film.services = [film.service];
              delete film.service;
            } else if (!film.services) {
              film.services = [];
            }
            // migrate legacy single genre string → array
            if (film.genre && !film.genres) {
              film.genres = [film.genre];
              delete film.genre;
            } else if (!film.genres) {
              film.genres = [];
            }
            if (!film.genres) film.genres = [];
            // migrate legacy single note object → notes array
            if (film.note && !film.notes) {
              film.notes = [{ id: String(Date.now()) + '_migrated', author: film.note.author, text: film.note.text, timestamp: new Date().toISOString() }];
              delete film.note;
            } else if (!film.notes) {
              film.notes = [];
            }
            return film;
          })
        : DEFAULT_FILMS.slice().map(f => ({ ...f, watched: false, services: [] }));
      const savedSeasons = Array.isArray(data.seasons) ? data.seasons : [];
      return { films: savedFilms, seasons: savedSeasons };
    }
  } catch (e) { console.warn('PrescFlix: could not read data', e); }
  return {
    films:   DEFAULT_FILMS.slice().map(f => ({ ...f, watched: false })),
    seasons: [],
  };
}

async function saveData() {
  await setDoc(DATA_DOC, { films, seasons });
}

// ── Poster wireframe SVG ───────────────────────────────────────────────────
function posterSVG(filmId) {
  const gid = `pg${filmId}`;
  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Film poster placeholder">
  <defs>
    <linearGradient id="${gid}sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#12121e"/>
    </linearGradient>
    <linearGradient id="${gid}bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#16162a"/>
      <stop offset="100%" stop-color="#0e0e1a"/>
    </linearGradient>
  </defs>

  <!-- Card background -->
  <rect width="200" height="300" fill="url(#${gid}bg)"/>

  <!-- Image area -->
  <rect x="0" y="0" width="200" height="210" fill="url(#${gid}sky)"/>

  <!-- Landscape scene – mountains -->
  <polygon points="0,160 55,95 110,155 148,108 200,155 200,210 0,210"
    fill="#1e1e32" opacity="0.9"/>
  <!-- Foreground layer -->
  <polygon points="0,185 40,155 80,175 130,148 170,170 200,158 200,210 0,210"
    fill="#18182a" opacity="0.9"/>

  <!-- Moon -->
  <circle cx="158" cy="52" r="20" fill="#252538"/>
  <!-- Moon crescent mask -->
  <circle cx="165" cy="46" r="17" fill="#1a1a2e"/>

  <!-- Stars -->
  <circle cx="30"  cy="30"  r="1.2" fill="#5fd3b9" opacity="0.55"/>
  <circle cx="68"  cy="18"  r="1"   fill="#5fd3b9" opacity="0.40"/>
  <circle cx="105" cy="38"  r="1.2" fill="#5fd3b9" opacity="0.50"/>
  <circle cx="50"  cy="55"  r="0.9" fill="#5fd3b9" opacity="0.35"/>
  <circle cx="130" cy="22"  r="1"   fill="#5fd3b9" opacity="0.45"/>
  <circle cx="88"  cy="70"  r="0.9" fill="#5fd3b9" opacity="0.30"/>

  <!-- Film camera outline icon (centre) -->
  <g transform="translate(100,110)" opacity="0.38">
    <rect x="-28" y="-18" width="56" height="36" fill="none"
          stroke="#5fd3b9" stroke-width="2.2" rx="6"/>
    <circle cx="0" cy="0" r="10" fill="none"
            stroke="#5fd3b9" stroke-width="2.2"/>
    <polygon points="28,-17 44,-26 44,26 28,17"
             fill="none" stroke="#5fd3b9" stroke-width="2" stroke-linejoin="round"/>
    <rect x="-22" y="-26" width="9" height="9" fill="none"
          stroke="#5fd3b9" stroke-width="1.5" rx="2"/>
  </g>

  <!-- Film strip bar top -->
  <rect x="0" y="0" width="200" height="14" fill="rgba(0,0,0,0.55)"/>
  <rect x="6"   y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="24"  y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="42"  y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="60"  y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="78"  y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="96"  y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="114" y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="132" y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="150" y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="168" y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>
  <rect x="186" y="3" width="9" height="8" fill="#2a2a3a" rx="1.5"/>

  <!-- Info area background -->
  <rect x="0" y="210" width="200" height="90" fill="#181826"/>

  <!-- Title placeholder bar -->
  <rect x="12" y="222" width="136" height="9"  fill="#2e2e42" rx="3"/>
  <!-- Subtitle / genre bar -->
  <rect x="12" y="237" width="96"  height="7"  fill="#24243a" rx="3"/>
  <!-- Year + rating row -->
  <rect x="12" y="252" width="44"  height="6"  fill="#1e1e30" rx="3"/>
  <rect x="64" y="252" width="28"  height="6"  fill="#1e1e30" rx="3"/>
  <!-- Stars row (tinted) -->
  <rect x="12" y="265" width="68"  height="6"  fill="#2a2a1e" rx="3"/>

  <!-- Border -->
  <rect x="0.5" y="0.5" width="199" height="299" fill="none"
        stroke="rgba(95,211,185,0.12)" stroke-width="1" rx="0"/>
</svg>`;
}

// ── Date formatter ────────────────────────────────────────────────────────
function formatWatchedDate(isoString) {
  const d = new Date(isoString);
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const yr  = String(d.getFullYear()).slice(-2);
  return `${day} ${mon} ${yr}`;
}

// ── Service logos (Google favicon API; url=null falls back to emoji) ───────
const SERVICE_ICONS = {
  'Netflix':       { url: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=32',        fallback: '🎞️' },
  'Amazon Prime':  { url: 'https://www.google.com/s2/favicons?domain=primevideo.com&sz=32',     fallback: '📦'  },
  'Apple TV+':     { url: 'https://www.google.com/s2/favicons?domain=tv.apple.com&sz=32',        fallback: '🍎'  },
  'NowTV':         { url: 'https://www.google.com/s2/favicons?domain=nowtv.com&sz=32',          fallback: '📡'  },
  'Paramount':     { url: 'https://www.google.com/s2/favicons?domain=paramountplus.com&sz=32',  fallback: '⛰️' },
  'BBC iPlayer':   { url: 'https://www.google.com/s2/favicons?domain=bbc.co.uk&sz=32',         fallback: '📺'  },
  'DVD':           { url: null,                                                                  fallback: '💿'  },
  'Blu-ray':       { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Blu-ray_Disc.svg/120px-Blu-ray_Disc.svg.png', fallback: '📀'  },
  'Disney+':       { url: 'https://www.google.com/s2/favicons?domain=disneyplus.com&sz=32',     fallback: '🏰'  },
  'Cinema':        { url: null,                                                                  fallback: '🎬'  },
  'Unknown':       { url: null,                                                                  fallback: '❓'  },
};

// Returns safe HTML: an <img> from Google favicon API, or the fallback emoji.
function serviceIcon(name) {
  const svc = SERVICE_ICONS[name];
  if (!svc) return esc(name);
  if (!svc.url) return svc.fallback;
  return `<img class="service-logo" src="${svc.url}" alt="${esc(name)}" loading="lazy" onerror="this.outerHTML='${svc.fallback}'">`;
}

// ── Service multi-picker (form) ────────────────────────────────────
// Excludes legacy "DVD / Blu-ray" (kept in SERVICE_ICONS for display on existing cards only)
const ALL_SERVICES = [
  'Netflix', 'Amazon Prime', 'Apple TV+', 'NowTV', 'Paramount',
  'BBC iPlayer', 'Disney+', 'DVD', 'Blu-ray', 'Cinema', 'Unknown',
];

function buildServicePicker(selectedServices = []) {
  const container = document.getElementById('field-services');
  if (!container) return;
  container.innerHTML = '';
  const totalUnselected = ALL_SERVICES.filter(s => !selectedServices.includes(s)).length;
  ALL_SERVICES.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'service-picker-btn';
    btn.dataset.service = name;
    const isSelected = selectedServices.includes(name);
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.classList.toggle('selected', isSelected);
    const svc = SERVICE_ICONS[name];
    const iconHtml = svc.url
      ? `<img class="service-logo" src="${svc.url}" alt="" loading="lazy" onerror="this.outerHTML='${svc.fallback}'">`
      : svc.fallback;
    btn.innerHTML = `${iconHtml}<span>${esc(name)}</span>`;
    if (!isSelected) btn.style.display = 'none';
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      btn.setAttribute('aria-pressed', String(btn.classList.contains('selected')));
    });
    container.appendChild(btn);
  });
  if (totalUnselected > 0) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'picker-expand-btn';
    toggle.textContent = `+ ${totalUnselected} more`;
    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      if (expanded) {
        container.querySelectorAll('.service-picker-btn').forEach(b => b.style.display = '');
        toggle.textContent = 'Show less';
      } else {
        container.querySelectorAll('.service-picker-btn:not(.selected)').forEach(b => b.style.display = 'none');
        toggle.textContent = `+ ${totalUnselected} more`;
      }
    });
    container.appendChild(toggle);
  }
}

function getSelectedServices() {
  const container = document.getElementById('field-services');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.service-picker-btn.selected'))
    .map(b => b.dataset.service);
}

// ── Genre multi-picker (form) ──────────────────────────────────────
const TMDB_GENRE_NAMES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
  'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

function buildGenrePicker(selectedGenres = []) {
  const container = document.getElementById('field-genres');
  if (!container) return;
  container.innerHTML = '';
  const totalUnselected = TMDB_GENRE_NAMES.filter(n => !selectedGenres.includes(n)).length;
  TMDB_GENRE_NAMES.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'genre-picker-btn';
    btn.dataset.genre = name;
    const isSelected = selectedGenres.includes(name);
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.classList.toggle('selected', isSelected);
    btn.textContent = name;
    if (!isSelected) btn.style.display = 'none';
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      btn.setAttribute('aria-pressed', String(btn.classList.contains('selected')));
    });
    container.appendChild(btn);
  });
  if (totalUnselected > 0) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'picker-expand-btn';
    toggle.textContent = `+ ${totalUnselected} more`;
    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      if (expanded) {
        container.querySelectorAll('.genre-picker-btn').forEach(b => b.style.display = '');
        toggle.textContent = 'Show less';
      } else {
        container.querySelectorAll('.genre-picker-btn:not(.selected)').forEach(b => b.style.display = 'none');
        toggle.textContent = `+ ${totalUnselected} more`;
      }
    });
    container.appendChild(toggle);
  }
}

function getSelectedGenres() {
  const container = document.getElementById('field-genres');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.genre-picker-btn.selected'))
    .map(b => b.dataset.genre);
}

// ── PRESC rating: average of Jay+Sarah rounded DOWN to nearest 0.5 ────────
function prescRating(rJay, rSarah) {
  if (rJay == null || rSarah == null) return null;
  return Math.floor((rJay + rSarah) * 2 / 2) / 2;
}

// ── Star display HTML (supports half-stars) ───────────────────────────────
function starsHTML(rating, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    if (rating >= i)           html += '<span class="star full">&#9733;</span>';
    else if (rating >= i - 0.5) html += '<span class="star half">&#9733;</span>';
    else                        html += '<span class="star empty">&#9733;</span>';
  }
  return `<span class="stars-display">${html}</span>`;
}

// ── External film link ────────────────────────────────────────────────────
function filmExternalLink(film) {
  if (film.tmdbId) return `https://www.themoviedb.org/movie/${film.tmdbId}`;
  return `https://www.imdb.com/find/?q=${encodeURIComponent(`${film.title} ${film.year || ''}`).trim()}`;
}

// ── HTML escape ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ── Render ─────────────────────────────────────────────────────────────────
let films   = [];
let seasons = [];
let activeTab     = 'queue';

function sortKey(title) {
  return title.replace(/^the\s+/i, '');
}
let sortByName    = false;
let filterService = '';
let filterUser    = '';
let filterSeason  = '';
let filterWatched = '';   // '', 'top', 'controversial'
let filterGenre   = '';
let filterSearch  = '';
let watchedSort   = 'date'; // 'date', 'presc', 'sarah', 'jay', 'title'
let editingFilmId = null;

// TMDB suggestion state
let pendingTmdbPoster = undefined; // undefined = no selection; null = selected film with no poster; string = URL
let pendingTmdbId    = undefined;  // undefined = no selection; number = TMDB movie ID
let tmdbDebounceTimer = null;
let tmdbSearchSeq     = 0;         // used to discard stale responses

function render() {
  // Sync tab button states
  document.querySelectorAll('.flix-tab').forEach(btn => {
    const isActive = btn.dataset.tab === activeTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Update section title to match active tab
  const titleEl = document.querySelector('.section-title');
  if (titleEl) titleEl.textContent = activeTab === 'queue' ? 'Queue' : 'Watched';

  // Compute queue positions from master array order (not affected by display sort)
  const queueOrder = films.filter(f => !f.watched);
  const queuePos = new Map(queueOrder.map((f, i) => [f.id, i + 1]));

  // Update sort button state
  const sortBtn         = document.getElementById('sort-btn');
  const watchedSortSel  = document.getElementById('watched-sort');
  const watchedFilterRow = document.getElementById('filter-watched-row');
  if (sortBtn)          sortBtn.style.display          = '';
  if (watchedSortSel)   watchedSortSel.style.display    = activeTab === 'watched' ? '' : 'none';
  if (watchedFilterRow) watchedFilterRow.style.display  = activeTab === 'watched' ? '' : 'none';
  if (sortBtn) {
    sortBtn.classList.toggle('active', sortByName);
    sortBtn.setAttribute('aria-pressed', String(sortByName));
  }

  // Reorder hint only relevant on queue tab when not sorted
  const reorderHint = document.getElementById('reorder-hint');
  if (reorderHint) {
    reorderHint.style.visibility = (activeTab === 'queue' && !sortByName) ? '' : 'hidden';
  }

  // Sync season filter dropdown
  const seasonSel = document.getElementById('filter-season');
  if (seasonSel) {
    const prevSeason = filterSeason;
    seasonSel.innerHTML = '<option value="">All seasons</option><option value="none">No season</option>';
    seasons.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      seasonSel.appendChild(o);
    });
    seasonSel.value = prevSeason;
    seasonSel.classList.toggle('active', filterSeason !== '');
  }

  // Build genre filter chips from all films on this tab
  const genreFilterRow = document.getElementById('filter-genre-row');
  const genreChipsEl   = document.getElementById('filter-genre');
  if (genreFilterRow && genreChipsEl) {
    const allTabFilms  = films.filter(f => (activeTab === 'watched') === f.watched);
    const uniqueGenres = [...new Set(allTabFilms.flatMap(f => Array.isArray(f.genres) ? f.genres : (f.genre ? [f.genre] : [])))].sort();
    genreFilterRow.style.display = uniqueGenres.length ? '' : 'none';
    if (uniqueGenres.length) {
      genreChipsEl.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.className    = `filter-chip${filterGenre === '' ? ' active' : ''}`;
      allBtn.dataset.filter = 'genre';
      allBtn.dataset.value  = '';
      allBtn.textContent    = 'All';
      genreChipsEl.appendChild(allBtn);
      uniqueGenres.forEach(g => {
        const btn = document.createElement('button');
        btn.className     = `filter-chip${filterGenre === g ? ' active' : ''}`;
        btn.dataset.filter = 'genre';
        btn.dataset.value  = g;
        btn.textContent    = g;
        genreChipsEl.appendChild(btn);
      });
    }
  }

  // Filter to only films for this tab, then apply service / user / season filters
  let tabFilms = films
    .filter(f => (activeTab === 'watched') === f.watched)
    .filter(f => {
      if (!filterService) return true;
      const svc = Array.isArray(f.services) ? f.services : (f.service ? [f.service] : []);
      return svc.includes(filterService);
    })
    .filter(f => !filterUser    || f.addedBy === filterUser)
    .filter(f => {
      if (!filterSeason) return true;
      if (filterSeason === 'none') return !f.seasonId;
      return f.seasonId === filterSeason;
    })
    .filter(f => !filterGenre || (Array.isArray(f.genres) ? f.genres : (f.genre ? [f.genre] : [])).includes(filterGenre))
    .filter(f => !filterSearch || f.title.toLowerCase().includes(filterSearch.toLowerCase()))
    .filter(f => {
      if (activeTab !== 'watched' || !filterWatched) return true;
      const pr = prescRating(f.ratingJay, f.ratingSarah);
      if (filterWatched === 'top')           return pr != null && pr >= 4;
      if (filterWatched === 'controversial') return f.ratingJay != null && f.ratingSarah != null && Math.abs(f.ratingJay - f.ratingSarah) > 2.5;
      return true;
    });

  // Apply sorting
  if (activeTab === 'watched' && !sortByName) {
    tabFilms = tabFilms.slice().sort((a, b) => {
      switch (watchedSort) {
        case 'title': return sortKey(a.title).localeCompare(sortKey(b.title));
        case 'sarah': return (b.ratingSarah ?? -1) - (a.ratingSarah ?? -1);
        case 'jay':   return (b.ratingJay   ?? -1) - (a.ratingJay   ?? -1);
        case 'presc': {
          const pA = prescRating(a.ratingJay, a.ratingSarah) ?? -1;
          const pB = prescRating(b.ratingJay, b.ratingSarah) ?? -1;
          return pB - pA;
        }
        default: return new Date(b.watchedDate) - new Date(a.watchedDate);
      }
    });
  } else if (sortByName) {
    tabFilms = tabFilms.slice().sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
  }

  // Cross-tab search hint (only when search is active)
  const crossHint = document.getElementById('cross-tab-hint');
  if (crossHint) {
    if (filterSearch) {
      const otherTab = activeTab === 'queue' ? 'watched' : 'queue';
      const otherLabel = activeTab === 'queue' ? 'Watched' : 'Queue';
      const otherCount = films
        .filter(f => (otherTab === 'watched') === f.watched)
        .filter(f => f.title.toLowerCase().includes(filterSearch.toLowerCase()))
        .length;
      if (otherCount > 0) {
        crossHint.textContent = `${otherCount} result${otherCount === 1 ? '' : 's'} also in ${otherLabel}`;
        crossHint.hidden = false;
      } else {
        crossHint.hidden = true;
      }
    } else {
      crossHint.hidden = true;
    }
  }

  const grid = document.getElementById('film-grid');
  grid.setAttribute('data-tab', activeTab);
  grid.innerHTML = '';
  tabFilms.forEach(film => {
    const card = document.createElement('div');
    card.className = 'film-card';
    card.dataset.id = film.id;
    // Disable drag when sorted (sort is display-only; drag would conflict with queue order)
    const draggable = activeTab === 'queue' && !sortByName;
    card.setAttribute('draggable', String(draggable));
    card.setAttribute('aria-label', `${esc(film.title)} (${film.year})`);
    const toggleLabel = film.watched ? 'Move to Queue' : 'Mark as watched';
    const badgeContent = activeTab === 'queue'
      ? queuePos.get(film.id)
      : (film.watchedDate ? formatWatchedDate(film.watchedDate) : null);
    const badgeHTML = badgeContent != null
      ? `<span class="queue-badge" role="button" tabindex="0" title="Edit film" aria-label="Edit ${esc(film.title)}">${esc(String(badgeContent))}</span>`
      : '';
    const filmSeason = film.seasonId ? seasons.find(s => s.id === film.seasonId) : null;
    const seasonLabelHTML = filmSeason
      ? `<span class="film-season">${esc(filmSeason.name)}</span>` : '';
    const filmGenres = Array.isArray(film.genres) ? film.genres : (film.genre ? [film.genre] : []);
    const genreHTML = filmGenres.length
      ? `<div class="film-genres">${filmGenres.map(g => `<span class="film-genre">${esc(g)}</span>`).join('')}</div>`
      : '';
    const filmServices = Array.isArray(film.services) ? film.services : (film.service ? [film.service] : []);
    const noteCount = film.notes && film.notes.length ? film.notes.length : 0;
    const noteBtnHTML = noteCount
      ? `<button class="note-btn" aria-label="${noteCount} note${noteCount > 1 ? 's' : ''}" title="${noteCount} note${noteCount > 1 ? 's' : ''}"><svg class="note-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="14" height="11" rx="2"/><polygon points="3,12 3,15 6,12"/></svg></button>`
      : '';
    const metaHTML = (filmServices.length || film.addedBy || noteCount)
      ? `<div class="film-meta">
          <div class="film-service-chips">${filmServices.map(s => `<span class="service-chip" data-service="${esc(s)}" title="${esc(s)}">${serviceIcon(s)}</span>`).join('')}</div>
          <div class="film-meta-right">${noteBtnHTML}${film.addedBy ? `<span class="added-by-badge">${esc(film.addedBy[0])}</span>` : ''}</div>
         </div>` : '';
    const pr = prescRating(film.ratingJay, film.ratingSarah);
    const posterOverlayHTML = (activeTab === 'watched' && (film.ratingSarah != null || film.ratingJay != null || pr != null))
      ? `<div class="poster-ratings-overlay" aria-hidden="true">
          <div class="poster-ratings-sj">
            ${film.ratingSarah != null ? `<span class="poster-rating-row poster-rating-muted"><span class="poster-rating-lbl">S</span>${starsHTML(film.ratingSarah)}</span>` : ''}
            ${film.ratingJay   != null ? `<span class="poster-rating-row poster-rating-muted"><span class="poster-rating-lbl">J</span>${starsHTML(film.ratingJay)}</span>`   : ''}
          </div>
          ${pr != null ? `<div class="poster-rating-presc">${starsHTML(pr, 5)}<span class="poster-presc-val">${pr}</span></div>` : ''}
         </div>` : '';
    const posterHTML = film.posterUrl
      ? `<img class="film-poster-img" src="${esc(film.posterUrl)}" alt="" loading="lazy">`
      : posterSVG(film.id);
    card.innerHTML = `
      <a class="film-poster" href="${esc(filmExternalLink(film))}" target="_blank" rel="noopener noreferrer" title="View on TMDB">${posterHTML}${posterOverlayHTML}${seasonLabelHTML}${badgeHTML}</a>
      <div class="film-info">
        <span class="film-title">${esc(film.title)}</span>
        <span class="film-year">${film.year}</span>
        ${genreHTML}
        ${metaHTML}
      </div>
      <button class="watch-toggle" aria-label="${toggleLabel}" title="${toggleLabel}">&#10003;</button>`;

    const badge = card.querySelector('.queue-badge');
    if (badge) badge.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openModal(film); });

    const noteBtn = card.querySelector('.note-btn');
    if (noteBtn) noteBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openNoteModal(film); });

    card.querySelector('.watch-toggle').addEventListener('click', e => {
      e.stopPropagation();
      const f = films.find(fi => fi.id === film.id);
      if (!f) return;
      if (f.watched) {
        f.watched = false;
        delete f.watchedDate;
        delete f.ratingJay;
        delete f.ratingSarah;
        saveData().catch(e => console.warn('PrescFlix: save failed', e));
        render();
      } else {
        openRatingModal(f);
      }
    });

    grid.appendChild(card);
  });

  // Attach drag handlers after inserting into DOM
  grid.querySelectorAll('.film-card').forEach(attachDesktopDnD);
  grid.querySelectorAll('.film-card').forEach(attachTouchDnD);
  attachGridDnD(grid);
}

// ── DnD helpers ────────────────────────────────────────────────────────────
function syncFilms() {
  if (sortByName) return; // sort is display-only; don't alter queue order
  const grid = document.getElementById('film-grid');
  const visibleIds = Array.from(grid.querySelectorAll('.film-card'))
    .map(c => Number(c.dataset.id));
  // Preserve order of visible films; keep hidden-tab films at the end
  const visible = visibleIds.map(id => films.find(f => f.id === id)).filter(Boolean);
  const hidden  = films.filter(f => !visibleIds.includes(f.id));
  films = [...visible, ...hidden];
  saveData().catch(e => console.warn('PrescFlix: save failed', e));
  render();
}

function createPlaceholder(referenceCard) {
  const ph = document.createElement('div');
  ph.className = 'drag-placeholder';
  ph.style.height = referenceCard.offsetHeight + 'px';
  return ph;
}

// Returns the index (within non-dragging film-cards) at which to insert
function getInsertionIndex(grid, x, y) {
  const cards = Array.from(grid.querySelectorAll('.film-card:not(.dragging)'));
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (y < rect.top) return i;
    if (y <= rect.bottom && x < rect.left + rect.width / 2) return i;
  }
  return cards.length;
}

// FLIP – move placeholder and animate surrounding cards into their new positions
function movePlaceholder(grid, ph, idx) {
  const nonDragged = Array.from(grid.querySelectorAll('.film-card:not(.dragging)'));

  // Step 1 – First: snapshot current visual positions (may include mid-animation transforms)
  const firsts = nonDragged.map(c => c.getBoundingClientRect());

  // Clear any in-progress inline transforms so the next read returns clean grid positions
  nonDragged.forEach(c => {
    c.style.transition = 'none';
    c.style.transform  = '';
  });

  // Move placeholder
  if (idx >= nonDragged.length) {
    grid.appendChild(ph);
  } else {
    grid.insertBefore(ph, nonDragged[idx]);
  }

  // Step 2 – Last: read natural positions after DOM change
  const lasts = nonDragged.map(c => c.getBoundingClientRect());

  // Step 3 – Invert: apply transforms to put cards back to their visual start
  nonDragged.forEach((c, i) => {
    const dx = firsts[i].left - lasts[i].left;
    const dy = firsts[i].top  - lasts[i].top;
    if (dx !== 0 || dy !== 0) {
      c.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  });

  // Force reflow so the browser registers the inverse transforms before we animate
  void grid.offsetHeight;

  // Step 4 – Play: re-enable CSS transitions and animate cards to their natural positions
  requestAnimationFrame(() => {
    nonDragged.forEach(c => {
      c.style.transition = '';
      c.style.transform  = '';
    });
  });
}

// Clear all inline transform/transition overrides (called on drop/cancel)
function clearFlipStyles(grid) {
  grid.querySelectorAll('.film-card').forEach(c => {
    c.style.transition = 'none';
    c.style.transform  = '';
  });
  requestAnimationFrame(() => {
    grid.querySelectorAll('.film-card').forEach(c => { c.style.transition = ''; });
  });
}

// ── Desktop drag & drop ────────────────────────────────────────────────────
let draggedCard   = null;
let placeholder   = null;
let lastInsertIdx = -1;

function attachDesktopDnD(card) {
  card.addEventListener('dragstart', e => {
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
    // Use timeout so browser captures drag image before we hide the card
    setTimeout(() => {
      placeholder = createPlaceholder(card);
      card.parentNode.insertBefore(placeholder, card);
      card.style.display = 'none';
    }, 0);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    card.style.display = '';
    if (placeholder) {
      // Drag was cancelled — restore card to its slot
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
      placeholder = null;
    }
    lastInsertIdx = -1;
    draggedCard = null;
  });
}

function attachGridDnD(grid) {
  grid.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedCard || !placeholder) return;
    const idx = getInsertionIndex(grid, e.clientX, e.clientY);
    if (idx === lastInsertIdx) return;
    lastInsertIdx = idx;
    movePlaceholder(grid, placeholder, idx);
  });

  grid.addEventListener('drop', e => {
    e.preventDefault();
    if (!draggedCard || !placeholder) return;
    clearFlipStyles(grid);
    grid.insertBefore(draggedCard, placeholder);
    placeholder.remove();
    placeholder = null;
    draggedCard.style.display = '';
    draggedCard.classList.remove('dragging');
    syncFilms();
    draggedCard = null;
    lastInsertIdx = -1;
  });
}

// ── Touch drag & drop ──────────────────────────────────────────────────────
function attachTouchDnD(card) {
  let longPressTimer   = null;
  let isDragging       = false;
  let ghost            = null;
  let touchPlaceholder = null;
  let originX          = 0;
  let originY          = 0;
  let lastTouchIdx     = -1;

  function startLongPress(e) {
    // Don't intercept taps on interactive children (badge, buttons, links)
    if (e.target.closest('button, a')) return;

    originX = e.touches[0].clientX;
    originY = e.touches[0].clientY;

    longPressTimer = setTimeout(() => {
      isDragging = true;
      card.classList.add('dragging');

      const rect = card.getBoundingClientRect();

      // Clone card for ghost before hiding original
      ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.classList.remove('dragging');
      ghost.style.left  = rect.left + 'px';
      ghost.style.top   = rect.top  + 'px';
      ghost.style.width = rect.width + 'px';

      // Insert placeholder and hide card
      touchPlaceholder = createPlaceholder(card);
      card.parentNode.insertBefore(touchPlaceholder, card);
      card.style.display = 'none';

      document.body.appendChild(ghost);
    }, 500);
  }

  function moveDrag(e) {
    const dx = e.touches[0].clientX - originX;
    const dy = e.touches[0].clientY - originY;

    if (!isDragging) {
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clearTimeout(longPressTimer);
      return;
    }

    e.preventDefault();

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;

    ghost.style.left = (x - ghost.offsetWidth  / 2) + 'px';
    ghost.style.top  = (y - ghost.offsetHeight / 2) + 'px';

    // Find insertion index and move placeholder
    ghost.style.visibility = 'hidden';
    const grid = document.getElementById('film-grid');
    const idx  = getInsertionIndex(grid, x, y);
    ghost.style.visibility = '';

    if (idx !== lastTouchIdx) {
      lastTouchIdx = idx;
      movePlaceholder(grid, touchPlaceholder, idx);
    }
  }

  function endDrag() {
    clearTimeout(longPressTimer);
    if (!isDragging) return;

    isDragging = false;
    card.classList.remove('dragging');
    card.style.display = '';
    if (ghost) { ghost.remove(); ghost = null; }

    lastTouchIdx = -1;
    if (touchPlaceholder) {
      const grid = document.getElementById('film-grid');
      clearFlipStyles(grid);
      grid.insertBefore(card, touchPlaceholder);
      touchPlaceholder.remove();
      touchPlaceholder = null;
      syncFilms();
    }
  }

  function cancelDrag() {
    clearTimeout(longPressTimer);
    if (!isDragging) return;
    isDragging = false;
    card.classList.remove('dragging');
    card.style.display = '';
    if (ghost) { ghost.remove(); ghost = null; }
    lastTouchIdx = -1;
    if (touchPlaceholder) {
      const grid = document.getElementById('film-grid');
      clearFlipStyles(grid);
      touchPlaceholder.parentNode.insertBefore(card, touchPlaceholder);
      touchPlaceholder.remove();
      touchPlaceholder = null;
    }
  }

  card.addEventListener('touchstart',  startLongPress, { passive: true });
  card.addEventListener('touchmove',   moveDrag,       { passive: false });
  card.addEventListener('touchend',    endDrag,        { passive: true });
  card.addEventListener('touchcancel', cancelDrag,     { passive: true });
}

// ── Sort ─────────────────────────────────────────────────────────────────
document.getElementById('sort-btn').addEventListener('click', () => {
  sortByName = !sortByName;
  render();
});

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.flix-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    render();
  });
});

// ── Filter chips ─────────────────────────────────────────────────────────────────
document.getElementById('filter-service').addEventListener('click', e => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  // Clicking an already-active non-All chip deselects it, reverting to All
  if (btn.dataset.value && btn.classList.contains('active')) {
    filterService = '';
  } else {
    filterService = btn.dataset.value;
  }
  document.querySelectorAll('#filter-service .filter-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === filterService));
  render();
});

document.getElementById('filter-user').addEventListener('click', e => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  if (btn.dataset.value && btn.classList.contains('active')) {
    filterUser = '';
  } else {
    filterUser = btn.dataset.value;
  }
  document.querySelectorAll('#filter-user .filter-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === filterUser));
  render();
});

// ── Season filter ───────────────────────────────────────────────────────────────
document.getElementById('filter-season').addEventListener('change', e => {
  filterSeason = e.target.value;
  e.target.classList.toggle('active', filterSeason !== '');
  render();
});

// ── Search filter ───────────────────────────────────────────────────────────────
document.getElementById('filter-search').addEventListener('input', e => {
  filterSearch = e.target.value.trim();
  render();
});

// Clicking the cross-tab hint switches to that tab
document.getElementById('cross-tab-hint').addEventListener('click', () => {
  activeTab = activeTab === 'queue' ? 'watched' : 'queue';
  render();
});

// ── Add film modal ────────────────────────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay');
const addFab       = document.getElementById('add-fab');
const modalClose   = document.getElementById('modal-close');
const addFilmForm  = document.getElementById('add-film-form');
const formError    = document.getElementById('form-error');

function populateSeasonOptions(currentSeasonId) {
  const sel = document.getElementById('field-season');
  if (!sel) return;
  sel.innerHTML = '<option value="">— None —</option>';
  seasons.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ Add new season…';
  sel.appendChild(newOpt);
  sel.value = currentSeasonId || '';
  toggleNewSeasonInput();
}

function toggleNewSeasonInput() {
  const sel   = document.getElementById('field-season');
  const label = document.getElementById('new-season-label');
  if (label) label.style.display = (sel && sel.value === '__new__') ? '' : 'none';
}

function openModal(film = null) {
  editingFilmId     = film ? film.id : null;
  pendingTmdbPoster = undefined;
  pendingTmdbId     = undefined;
  clearTimeout(tmdbDebounceTimer);
  const tmdbDrop = document.getElementById('tmdb-suggestions');
  if (tmdbDrop) { tmdbDrop.hidden = true; tmdbDrop.innerHTML = ''; }
  document.getElementById('modal-title').textContent = film ? 'Edit Film' : 'Add a Film';
  document.querySelector('.form-submit').textContent  = film ? 'Save Changes' : 'Add to Queue';
  const modalDeleteBtn = document.getElementById('modal-delete-btn');
  if (modalDeleteBtn) modalDeleteBtn.style.display = film ? 'block' : 'none';
  populateSeasonOptions(film ? film.seasonId : '');
  buildServicePicker(film ? (film.services || []) : []);
  buildGenrePicker(film ? (film.genres || []) : []);
  const watchedDateLabel = document.getElementById('watched-date-label');
  if (film) {
    document.getElementById('field-title').value    = film.title    || '';
    document.getElementById('field-year').value     = film.year     || '';
    const radio = addFilmForm.querySelector(`input[name="addedBy"][value="${esc(film.addedBy || '')}"]`);
    if (radio) radio.checked = true;
    if (film.watched && film.watchedDate) {
      document.getElementById('field-watched-date').value = film.watchedDate.slice(0, 10);
      if (watchedDateLabel) watchedDateLabel.style.display = '';
    } else {
      if (watchedDateLabel) watchedDateLabel.style.display = 'none';
    }
  } else {
    if (watchedDateLabel) watchedDateLabel.style.display = 'none';
  }
  modalOverlay.setAttribute('aria-hidden', 'false');
  modalOverlay.classList.add('open');
  document.getElementById('field-title').focus();
  const editModalNoteBtn = document.getElementById('edit-modal-note-btn');
  if (editModalNoteBtn) {
    if (film) {
      editModalNoteBtn.textContent = (film.notes && film.notes.length) ? `💬 Notes (${film.notes.length})` : '💬 Add Note';
      editModalNoteBtn.style.display = '';
    } else {
      editModalNoteBtn.style.display = 'none';
    }
  }
}

function closeModal() {
  editingFilmId     = null;
  pendingTmdbPoster = undefined;
  pendingTmdbId     = undefined;
  clearTimeout(tmdbDebounceTimer);
  const tmdbDrop = document.getElementById('tmdb-suggestions');
  if (tmdbDrop) { tmdbDrop.hidden = true; tmdbDrop.innerHTML = ''; }
  modalOverlay.setAttribute('aria-hidden', 'true');
  modalOverlay.classList.remove('open');
  addFilmForm.reset();
  formError.textContent = '';
  addFab.focus();
}

addFab.addEventListener('click', () => openModal());
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeNoteModal(); } });

// Note button in edit modal — opens note modal for this film
const editModalNoteBtn = document.getElementById('edit-modal-note-btn');
if (editModalNoteBtn) {
  editModalNoteBtn.addEventListener('click', () => {
    if (editingFilmId === null) return;
    const film = films.find(fi => fi.id === editingFilmId);
    if (!film) return;
    closeModal();
    openNoteModal(film);
  });
}

// Modal delete button (Edit page — accessible on all devices)
const modalDeleteBtn = document.getElementById('modal-delete-btn');
if (modalDeleteBtn) {
  modalDeleteBtn.addEventListener('click', () => {
    if (!editingFilmId) return;
    const film = films.find(fi => fi.id === editingFilmId);
    if (!film) return;
    if (!window.confirm(`Remove "${film.title}" from your list?`)) return;
    films = films.filter(fi => fi.id !== editingFilmId);
    saveData().catch(e => console.warn('PrescFlix: save failed', e));
    closeModal();
    render();
  });
}

// ── Filter toggle (mobile) ────────────────────────────────────────────────
const filterToggleBtn = document.getElementById('filter-toggle-btn');
const filterBar       = document.getElementById('filter-bar');
if (filterToggleBtn && filterBar) {
  filterToggleBtn.addEventListener('click', () => {
    const isCollapsed = filterBar.classList.toggle('collapsed');
    filterToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    filterToggleBtn.textContent = isCollapsed ? 'Filters ▸' : 'Filters ▾';
  });
}

document.getElementById('field-season').addEventListener('change', toggleNewSeasonInput);

addFilmForm.addEventListener('submit', async e => {
  e.preventDefault();
  formError.textContent = '';

  const title    = document.getElementById('field-title').value.trim();
  const yearRaw  = document.getElementById('field-year').value.trim();
  const addedBy  = (addFilmForm.querySelector('input[name="addedBy"]:checked') || {}).value || '';
  const services = getSelectedServices();
  const genres   = getSelectedGenres();
  let   seasonId = document.getElementById('field-season').value;

  if (!title)   { formError.textContent = 'Please enter a title.'; return; }
  if (!yearRaw) { formError.textContent = 'Please enter a year.';  return; }
  const year = parseInt(yearRaw, 10);
  if (isNaN(year) || year < 1888 || year > 2099) {
    formError.textContent = 'Please enter a valid year (1888–2099).';
    return;
  }

  if (seasonId === '__new__') {
    const newName = document.getElementById('field-new-season').value.trim();
    if (!newName) { formError.textContent = 'Please enter a season name.'; return; }
    const ns = { id: String(Date.now()), name: newName };
    seasons.push(ns);
    seasonId = ns.id;
  }

  const isAdding = editingFilmId === null;
  if (!isAdding) {
    const f = films.find(fi => fi.id === editingFilmId);
    if (f) {
      f.title = title;
      f.year  = year;
      if (pendingTmdbPoster !== undefined) {
        if (pendingTmdbPoster) f.posterUrl = pendingTmdbPoster; else delete f.posterUrl;
      }
      if (pendingTmdbId !== undefined) {
        if (pendingTmdbId) f.tmdbId = pendingTmdbId; else delete f.tmdbId;
      }
      if (f.watched) {
        const dateVal = document.getElementById('field-watched-date').value;
        if (dateVal) f.watchedDate = new Date(dateVal + 'T12:00:00').toISOString();
      }
      if (addedBy)          f.addedBy  = addedBy;  else delete f.addedBy;
      if (services.length)  f.services = services; else delete f.services;
      delete f.service; // remove any legacy single-service field
      if (genres.length)    f.genres   = genres;   else delete f.genres;
      delete f.genre;   // remove any legacy single-genre field
      if (seasonId) f.seasonId = seasonId; else delete f.seasonId;
    }
  } else {
    const newFilm = { id: Date.now(), title, year, watched: false };
    if (pendingTmdbPoster)  newFilm.posterUrl = pendingTmdbPoster;
    if (pendingTmdbId)      newFilm.tmdbId    = pendingTmdbId;
    if (addedBy)            newFilm.addedBy   = addedBy;
    if (services.length)    newFilm.services  = services;
    if (genres.length)      newFilm.genres    = genres;
    if (seasonId)           newFilm.seasonId  = seasonId;
    films.push(newFilm);
  }

  await saveData();
  closeModal();
  if (isAdding) activeTab = 'queue';
  render();
});

// ── Watched filter chips ──────────────────────────────────────────────────
document.getElementById('filter-watched').addEventListener('click', e => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  if (btn.dataset.value && btn.classList.contains('active')) {
    filterWatched = '';
  } else {
    filterWatched = btn.dataset.value;
  }
  document.querySelectorAll('#filter-watched .filter-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === filterWatched));
  render();
});

// ── Watched sort select ───────────────────────────────────────────────────
document.getElementById('watched-sort').addEventListener('change', e => {
  watchedSort = e.target.value;
  render();
});

// ── Rating modal ──────────────────────────────────────────────────────────
let ratingPendingFilm = null;
let ratingSarahVal    = 0;
let ratingJayVal      = 0;

function buildStarPicker(containerId, onChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  let currentVal = 0;
  const btns = [];

  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn';
    btn.dataset.value = i;
    btn.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    btn.textContent = '★';
    container.appendChild(btn);
    btns.push(btn);
  }

  function updateDisplay(val) {
    btns.forEach((b, idx) => {
      const full = val >= idx + 1;
      const half = !full && val >= idx + 0.5;
      b.classList.toggle('selected-full', full);
      b.classList.toggle('selected-half', half);
    });
  }

  function valueFromPointer(clientX, btn) {
    const rect = btn.getBoundingClientRect();
    const idx  = btns.indexOf(btn);
    return clientX < rect.left + rect.width / 2 ? idx + 0.5 : idx + 1;
  }

  container.addEventListener('mousemove', e => {
    const btn = e.target.closest('.star-btn');
    if (btn) updateDisplay(valueFromPointer(e.clientX, btn));
  });

  container.addEventListener('mouseleave', () => updateDisplay(currentVal));

  container.addEventListener('click', e => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    currentVal = valueFromPointer(e.clientX, btn);
    onChange(currentVal);
    updateDisplay(currentVal);
  });

  container.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    const el    = document.elementFromPoint(touch.clientX, touch.clientY);
    const btn   = el && el.closest('.star-btn');
    if (btn && btns.includes(btn)) updateDisplay(valueFromPointer(touch.clientX, btn));
  }, { passive: true });

  container.addEventListener('touchend', e => {
    const touch = e.changedTouches[0];
    const el    = document.elementFromPoint(touch.clientX, touch.clientY);
    const btn   = el && el.closest('.star-btn');
    if (btn && btns.includes(btn)) {
      currentVal = valueFromPointer(touch.clientX, btn);
      onChange(currentVal);
      updateDisplay(currentVal);
    }
  }, { passive: true });
}

function openRatingModal(film) {
  ratingPendingFilm = film;
  ratingSarahVal    = 0;
  ratingJayVal      = 0;
  document.getElementById('rating-film-name').textContent = film.title;
  buildStarPicker('star-sarah', v => { ratingSarahVal = v; });
  buildStarPicker('star-jay',   v => { ratingJayVal   = v; });
  const overlay = document.getElementById('rating-overlay');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
}

function closeRatingModal() {
  document.getElementById('rating-overlay').setAttribute('aria-hidden', 'true');
  document.getElementById('rating-overlay').classList.remove('open');
  ratingPendingFilm = null;
}

document.getElementById('rating-save').addEventListener('click', () => {
  if (!ratingPendingFilm) return;
  const f = ratingPendingFilm;
  f.watched     = true;
  f.watchedDate = new Date().toISOString();
  if (ratingSarahVal) f.ratingSarah = ratingSarahVal; else delete f.ratingSarah;
  if (ratingJayVal)   f.ratingJay   = ratingJayVal;   else delete f.ratingJay;
  saveData().catch(e => console.warn('PrescFlix: save failed', e));
  closeRatingModal();
  activeTab = 'watched';
  render();
});

document.getElementById('rating-skip').addEventListener('click', () => {
  if (!ratingPendingFilm) return;
  const f = ratingPendingFilm;
  f.watched     = true;
  f.watchedDate = new Date().toISOString();
  delete f.ratingSarah;
  delete f.ratingJay;
  saveData().catch(e => console.warn('PrescFlix: save failed', e));
  closeRatingModal();
  activeTab = 'watched';
  render();
});

document.getElementById('rating-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('rating-overlay')) closeRatingModal();
});

// ── TMDB search wiring ─────────────────────────────────────────────────────
function initTmdbSearch() {
  const titleInput = document.getElementById('field-title');
  const yearInput  = document.getElementById('field-year');
  const dropdown   = document.getElementById('tmdb-suggestions');

  function hideSuggestions() {
    dropdown.hidden   = true;
    dropdown.innerHTML = '';
  }

  function showSuggestions(results) {
    dropdown.innerHTML = '';
    if (!results.length) { dropdown.hidden = true; return; }
    results.forEach(r => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tmdb-suggestion-item';
      const thumbEl = r.thumbUrl
        ? `<img class="tmdb-suggestion-thumb" src="${esc(r.thumbUrl)}" alt="" loading="lazy">`
        : `<span class="tmdb-suggestion-thumb tmdb-suggestion-thumb--empty">🎬</span>`;
      item.innerHTML = `${thumbEl}<span class="tmdb-suggestion-info">
        <span class="tmdb-suggestion-title">${esc(r.title)}</span>
        ${r.year ? `<span class="tmdb-suggestion-year">${r.year}</span>` : ''}
      </span>`;
      item.addEventListener('click', async () => {
        titleInput.value  = r.title;
        if (r.year) yearInput.value = r.year;
        pendingTmdbPoster = r.posterUrl;
        pendingTmdbId    = r.tmdbId;
        // Pre-fill genres from all matching TMDB genre_ids
        if (r.genreIds && r.genreIds.length) {
          const names = r.genreIds.map(id => genreMap.get(id)).filter(Boolean);
          if (names.length) buildGenrePicker(names);
        }
        // Auto-select UK streaming services from TMDB watch providers
        if (r.tmdbId) {
          const providers = await tmdbProviders(r.tmdbId);
          if (providers.length) buildServicePicker(providers);
        }
        hideSuggestions();
        titleInput.focus();
      });
      dropdown.appendChild(item);
    });
    dropdown.hidden = false;
  }

  titleInput.addEventListener('input', () => {
    clearTimeout(tmdbDebounceTimer);
    pendingTmdbPoster = undefined;
    pendingTmdbId     = undefined;
    const q = titleInput.value.trim();
    if (q.length < 3) { hideSuggestions(); return; }
    const seq = ++tmdbSearchSeq;
    tmdbDebounceTimer = setTimeout(async () => {
      const results = await tmdbSearch(q);
      if (seq !== tmdbSearchSeq) return;                      // stale response
      if (!modalOverlay.classList.contains('open')) return;   // modal closed
      showSuggestions(results);
    }, 500);
  });

  // Hide dropdown when clicking outside the title field / dropdown
  document.addEventListener('click', e => {
    if (!e.target.closest('#tmdb-suggestions') && e.target !== titleInput) {
      hideSuggestions();
    }
  });
}

// ── Genre filter chips ───────────────────────────────────────────────────
document.getElementById('filter-genre').addEventListener('click', e => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  if (btn.dataset.value && btn.classList.contains('active')) {
    filterGenre = '';
  } else {
    filterGenre = btn.dataset.value;
  }
  render();
});

// ── Season management ─────────────────────────────────────────────────────
function renderSeasonsList() {
  const list  = document.getElementById('seasons-list');
  const empty = document.getElementById('seasons-empty');
  if (!list) return;
  list.innerHTML = '';
  if (!seasons.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  seasons.forEach(s => {
    const count = films.filter(f => f.seasonId === s.id).length;
    const row = document.createElement('div');
    row.className = 'season-manage-row';
    row.innerHTML = `
      <input class="season-name-input form-input" type="text" value="${esc(s.name)}" aria-label="Season name" data-id="${esc(s.id)}">
      <button class="season-save-btn" data-id="${esc(s.id)}" title="Save name" aria-label="Save season name">Save</button>
      <button class="season-delete-btn" data-id="${esc(s.id)}" title="Delete season (${count} film${count !== 1 ? 's' : ''} will be unlinked)" aria-label="Delete ${esc(s.name)}">&#x1F5D1;</button>`;
    row.querySelector('.season-save-btn').addEventListener('click', () => {
      const input   = row.querySelector('.season-name-input');
      const newName = input.value.trim();
      if (!newName) return;
      const season = seasons.find(x => x.id === s.id);
      if (season) { season.name = newName; saveData().catch(e => console.warn('PrescFlix: save failed', e)); render(); renderSeasonsList(); }
    });
    row.querySelector('.season-delete-btn').addEventListener('click', () => {
      const filmCount = films.filter(f => f.seasonId === s.id).length;
      const msg = filmCount > 0
        ? `Delete season "${s.name}"?\n${filmCount} film${filmCount !== 1 ? 's' : ''} will be unlinked but not deleted.`
        : `Delete season "${s.name}"?`;
      if (!window.confirm(msg)) return;
      seasons = seasons.filter(x => x.id !== s.id);
      films.forEach(f => { if (f.seasonId === s.id) delete f.seasonId; });
      saveData().catch(e => console.warn('PrescFlix: save failed', e));
      render();
      renderSeasonsList();
    });
    list.appendChild(row);
  });
}

function openManageSeasons() {
  renderSeasonsList();
  const overlay = document.getElementById('seasons-overlay');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
}

function closeManageSeasons() {
  const overlay = document.getElementById('seasons-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
}

document.getElementById('manage-seasons-btn').addEventListener('click', openManageSeasons);
document.getElementById('seasons-overlay-close').addEventListener('click', closeManageSeasons);
document.getElementById('seasons-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('seasons-overlay')) closeManageSeasons();
});

// ── Note modal ─────────────────────────────────────────────────────────────
let notePendingFilm = null;

function renderNotesThread(film) {
  const thread = document.getElementById('notes-thread');
  if (!thread) return;
  const notes = film.notes || [];
  if (!notes.length) {
    thread.innerHTML = '<p class="notes-empty">No notes yet. Be the first to leave one!</p>';
    return;
  }
  thread.innerHTML = notes.map(note => {
    const side    = note.author === 'Sarah' ? 'sarah' : 'jay';
    const timeStr = note.timestamp ? formatWatchedDate(note.timestamp) : '';
    return `<div class="note-bubble note-bubble--${side}">
      <span class="note-bubble__author">${esc(note.author)}</span>
      <p class="note-bubble__text">${esc(note.text)}</p>
      <div class="note-bubble__footer">
        <span class="note-bubble__time">${esc(timeStr)}</span>
        <button class="note-bubble__delete" data-note-id="${esc(note.id)}" aria-label="Delete note" title="Delete note">&#x2715;</button>
      </div>
    </div>`;
  }).join('');
  thread.scrollTop = thread.scrollHeight;
  thread.querySelectorAll('.note-bubble__delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!notePendingFilm) return;
      if (!window.confirm('Delete this note?')) return;
      const f = films.find(fi => fi.id === notePendingFilm.id);
      if (!f) return;
      const removed = f.notes.find(n => n.id === btn.dataset.noteId);
      f.notes = (f.notes || []).filter(n => n.id !== btn.dataset.noteId);
      try {
        await saveData();
      } catch (err) {
        if (removed) f.notes.push(removed); // roll back
      }
      notePendingFilm = f;
      renderNotesThread(f);
      render();
    });
  });
}

function openNoteModal(film) {
  notePendingFilm = film;
  document.getElementById('note-film-name').textContent = film.title;
  document.getElementById('note-text').value            = '';
  document.getElementById('note-error').textContent     = '';
  document.querySelectorAll('input[name="noteAuthor"]').forEach(r => { r.checked = false; });
  renderNotesThread(film);
  const overlay = document.getElementById('note-overlay');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.getElementById('note-text').focus();
}

function closeNoteModal() {
  const overlay = document.getElementById('note-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  notePendingFilm = null;
}

document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
document.getElementById('note-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('note-overlay')) closeNoteModal();
});

// Send on Enter (Shift+Enter for newline)
document.getElementById('note-text').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('note-save').click();
  }
});

document.getElementById('note-save').addEventListener('click', async () => {
  if (!notePendingFilm) return;
  const text    = document.getElementById('note-text').value.trim();
  const author  = (document.querySelector('input[name="noteAuthor"]:checked') || {}).value || '';
  const errorEl = document.getElementById('note-error');
  if (!text)   { errorEl.textContent = 'Please enter a note.';                    return; }
  if (!author) { errorEl.textContent = 'Please select who is leaving this note.'; return; }
  errorEl.textContent = '';
  const f = films.find(fi => fi.id === notePendingFilm.id);
  if (!f) return;
  if (!Array.isArray(f.notes)) f.notes = [];
  f.notes.push({ id: String(Date.now()), author, text, timestamp: new Date().toISOString() });
  notePendingFilm = f;
  const sendBtn = document.getElementById('note-save');
  sendBtn.disabled = true;
  try {
    await saveData();
  } catch (err) {
    errorEl.textContent = 'Failed to save note. Please try again.';
    f.notes.pop(); // roll back the optimistic push
    notePendingFilm = f;
    renderNotesThread(f);
    sendBtn.disabled = false;
    return;
  }
  sendBtn.disabled = false;
  document.getElementById('note-text').value = '';
  renderNotesThread(f);
  render();
});

// ── Boot ───────────────────────────────────────────────────────────────────
initTmdbSearch();
loadGenres(); // non-blocking: populates genreMap for TMDB suggestion pre-fill

(async () => {
  ({ films, seasons } = await loadData());
  render();
})();
