import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA4wFvRoHQ3lre4-NO18ogVaSYM_hTohFA',
  authDomain: 'presc-weight.firebaseapp.com',
  projectId: 'presc-weight',
  storageBucket: 'presc-weight.firebasestorage.app',
  messagingSenderId: '77512782350',
  appId: '1:77512782350:web:afc4eb48ab146d5d9cc25f',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const cluesRef = collection(db, 'crosswordClues');

const entryForm = document.getElementById('entry-form');
const clueInput = document.getElementById('clue-input');
const answerInput = document.getElementById('answer-input');
const letterCountOutput = document.getElementById('letter-count-output');
const formMessage = document.getElementById('form-message');
const lengthFilter = document.getElementById('length-filter');
const patternBoxes = document.getElementById('pattern-boxes');
const clueList = document.getElementById('clue-list');
const listStatus = document.getElementById('list-status');

let entries = [];
let knownLetters = [];

function normalizeAnswer(rawValue) {
  return rawValue.toUpperCase().replace(/[^A-Z]/g, '');
}

function updateCountPreview() {
  const normalized = normalizeAnswer(answerInput.value);
  letterCountOutput.value = String(normalized.length);
}

function setFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? '#ff8f8f' : '';
}

function setListStatus(message, isError = false) {
  listStatus.textContent = message;
  listStatus.style.color = isError ? '#ff8f8f' : '';
}

function sortByLengthThenClue(list) {
  return [...list].sort((a, b) => {
    if (a.letterCount !== b.letterCount) return a.letterCount - b.letterCount;
    return a.clue.localeCompare(b.clue);
  });
}

function rebuildLengthFilter() {
  const current = lengthFilter.value;
  const lengths = [...new Set(entries.map(entry => entry.letterCount))].sort((a, b) => a - b);
  lengthFilter.innerHTML = '<option value="all">All lengths</option>';
  lengths.forEach(length => {
    const option = document.createElement('option');
    option.value = String(length);
    option.textContent = `${length} letters`;
    lengthFilter.append(option);
  });
  if (current !== 'all' && lengths.includes(Number(current))) {
    lengthFilter.value = current;
  }
}

function renderPatternBoxes() {
  patternBoxes.innerHTML = '';
  const selectedLength = Number(lengthFilter.value);
  if (!Number.isInteger(selectedLength) || selectedLength <= 0) {
    knownLetters = [];
    return;
  }

  if (knownLetters.length !== selectedLength) {
    knownLetters = Array.from({ length: selectedLength }, (_, index) => knownLetters[index] || '');
  }

  knownLetters.forEach((letter, index) => {
    const input = document.createElement('input');
    input.className = 'letter-box';
    input.maxLength = 1;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.value = letter;
    input.setAttribute('aria-label', `Letter ${index + 1}`);
    input.addEventListener('input', () => {
      const value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      input.value = value;
      knownLetters[index] = value;
      renderClues();
    });
    patternBoxes.append(input);
  });
}

function getFilteredEntries() {
  const selectedLength = Number(lengthFilter.value);
  return entries.filter(entry => {
    if (Number.isInteger(selectedLength) && selectedLength > 0 && entry.letterCount !== selectedLength) {
      return false;
    }
    if (!knownLetters.length) return true;
    return knownLetters.every((letter, index) => !letter || entry.answer[index] === letter);
  });
}

function renderClues() {
  const filtered = sortByLengthThenClue(getFilteredEntries());
  clueList.innerHTML = '';

  if (!filtered.length) {
    setListStatus('No clues match the current filters.');
    return;
  }

  setListStatus(`${filtered.length} clue${filtered.length === 1 ? '' : 's'} shown.`);

  const grouped = new Map();
  filtered.forEach(entry => {
    if (!grouped.has(entry.letterCount)) grouped.set(entry.letterCount, []);
    grouped.get(entry.letterCount).push(entry);
  });

  [...grouped.keys()].sort((a, b) => a - b).forEach(length => {
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<h3>${length} letters</h3>`;
    const list = document.createElement('ul');

    grouped.get(length).forEach(entry => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span class="clue-text">${entry.clue}</span>
        <span class="count-pill">${entry.letterCount}</span>
      `;
      list.append(item);
    });

    section.append(list);
    clueList.append(section);
  });
}

async function loadEntries() {
  setListStatus('Loading clues...');
  try {
    const snapshot = await getDocs(query(cluesRef, orderBy('letterCount'), orderBy('clue')));
    entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    rebuildLengthFilter();
    renderPatternBoxes();
    renderClues();
  } catch {
    setListStatus('Could not load clues right now.', true);
  }
}

entryForm.addEventListener('submit', async event => {
  event.preventDefault();
  setFormMessage('');

  const clue = clueInput.value.trim();
  const answer = normalizeAnswer(answerInput.value);

  if (!clue || !answer) {
    setFormMessage('Enter both a clue and answer.', true);
    return;
  }

  const entry = {
    clue,
    answer,
    letterCount: answer.length,
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(cluesRef, entry);
    clueInput.value = '';
    answerInput.value = '';
    updateCountPreview();
    setFormMessage('Entry saved.');
    await loadEntries();
  } catch {
    setFormMessage('Could not save entry right now.', true);
  }
});

answerInput.addEventListener('input', updateCountPreview);
lengthFilter.addEventListener('change', () => {
  knownLetters = [];
  renderPatternBoxes();
  renderClues();
});

updateCountPreview();
loadEntries();
