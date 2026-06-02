import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
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

const pageShell = document.querySelector('.page-shell');
const pageType = pageShell?.dataset.page || 'solve';

const entryForm = document.getElementById('entry-form');
const clueInput = document.getElementById('clue-input');
const answerInput = document.getElementById('answer-input');
const letterCountOutput = document.getElementById('letter-count-output');
const formMessage = document.getElementById('form-message');

const lengthFilter = document.getElementById('length-filter');
const clueSearch = document.getElementById('clue-search');
const patternBoxes = document.getElementById('pattern-boxes');
const clueList = document.getElementById('clue-list');
const listStatus = document.getElementById('list-status');
const actionMessage = document.getElementById('action-message');

let entries = [];
let knownLetters = [];
let activeEditId = null;

const FLASH_KEY = 'crosswordFlashMessage';

function setFlashMessage(message, isError = false) {
  sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, isError }));
}

function consumeFlashMessage() {
  const raw = sessionStorage.getItem(FLASH_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(FLASH_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeAnswer(rawValue) {
  return rawValue.toUpperCase().replace(/[^A-Z]/g, '');
}

function updateCountPreview() {
  if (!answerInput || !letterCountOutput) return;
  const normalized = normalizeAnswer(answerInput.value);
  letterCountOutput.value = String(normalized.length);
}

function setFormMessage(message, isError = false) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.style.color = isError ? '#c0392b' : '';
}

function setListStatus(message, isError = false) {
  if (!listStatus) return;
  listStatus.textContent = message;
  listStatus.style.color = isError ? '#c0392b' : '';
}

function setActionMessage(message, isError = false) {
  if (!actionMessage) return;
  actionMessage.textContent = message;
  actionMessage.style.color = isError ? '#c0392b' : '';
}

function sortByLengthThenClue(list) {
  return [...list].sort((a, b) => {
    if (a.letterCount !== b.letterCount) return a.letterCount - b.letterCount;
    return a.clue.localeCompare(b.clue);
  });
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function rebuildLengthFilter() {
  if (!lengthFilter) return;
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

function tokenFromInputValue(value) {
  if (value === ' ') return ' ';
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
}

function applyTokenToInput(input, index, token) {
  input.value = token;
  knownLetters[index] = token;
}

function focusPatternIndex(index) {
  if (!patternBoxes) return;
  const box = patternBoxes.querySelector(`[data-index="${index}"]`);
  if (box) box.focus();
}

function renderPatternBoxes() {
  if (!patternBoxes || !lengthFilter) return;
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
    input.dataset.index = String(index);
    input.value = letter;
    input.setAttribute('aria-label', `Letter ${index + 1}`);

    input.addEventListener('input', () => {
      const token = tokenFromInputValue(input.value);
      applyTokenToInput(input, index, token);
      if (token && index < knownLetters.length - 1) {
        focusPatternIndex(index + 1);
      }
      renderClues();
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace') {
        event.preventDefault();
        if (knownLetters[index]) {
          applyTokenToInput(input, index, '');
          renderClues();
          return;
        }
        if (index > 0) {
          focusPatternIndex(index - 1);
          const prevInput = patternBoxes.querySelector(`[data-index="${index - 1}"]`);
          if (prevInput) {
            applyTokenToInput(prevInput, index - 1, '');
            renderClues();
          }
        }
        return;
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        focusPatternIndex(index - 1);
      }

      if (event.key === 'ArrowRight' && index < knownLetters.length - 1) {
        event.preventDefault();
        focusPatternIndex(index + 1);
      }
    });

    patternBoxes.append(input);
  });
}

function getFilteredEntries() {
  const selectedLength = Number(lengthFilter?.value);
  const searchValue = clueSearch?.value.trim().toLowerCase() || '';

  return entries.filter(entry => {
    if (Number.isInteger(selectedLength) && selectedLength > 0 && entry.letterCount !== selectedLength) {
      return false;
    }

    if (searchValue && !entry.clue.toLowerCase().includes(searchValue)) {
      return false;
    }

    if (!knownLetters.length) return true;
    return knownLetters.every((token, index) => {
      if (!token || token === ' ') return true;
      return entry.answer[index] === token;
    });
  });
}

function renderClues() {
  if (!clueList) return;
  const filtered = sortByLengthThenClue(getFilteredEntries());
  clueList.innerHTML = '';

  if (!filtered.length) {
    setListStatus('No clues match the current filters. Try another pattern or length.');
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
      item.dataset.entryId = entry.id;

      if (activeEditId === entry.id) {
        item.className = 'editing-item';
        item.innerHTML = `
          <div class="entry-edit-grid">
            <label for="edit-clue-${entry.id}">Clue</label>
            <input id="edit-clue-${entry.id}" class="edit-clue" type="text" maxlength="200" value="${escapeAttribute(entry.clue)}" />
            <label for="edit-answer-${entry.id}">Answer</label>
            <input id="edit-answer-${entry.id}" class="edit-answer" type="text" maxlength="40" value="${escapeAttribute(entry.answer)}" />
          </div>
          <div class="entry-actions">
            <button type="button" class="small-button" data-action="save-edit">Save</button>
            <button type="button" class="small-button secondary" data-action="cancel-edit">Cancel</button>
          </div>
        `;
      } else {
        item.innerHTML = `
          <div class="entry-text">
            <span class="clue-text">${entry.clue}</span>
            <span class="answer-text">${entry.answer}</span>
          </div>
          <div class="entry-actions">
            <span class="count-pill">${entry.letterCount}</span>
            <button type="button" class="small-button secondary" data-action="edit">Edit</button>
            <button type="button" class="small-button danger" data-action="delete">Delete</button>
          </div>
        `;
      }

      list.append(item);
    });

    section.append(list);
    clueList.append(section);
  });
}

async function updateEntry(entryId, clueValue, answerValue) {
  const clue = clueValue.trim();
  const answer = normalizeAnswer(answerValue);

  if (!clue || !answer) {
    setActionMessage('Provide both a clue and a valid alphabetic answer.', true);
    return;
  }

  try {
    await updateDoc(doc(db, 'crosswordClues', entryId), {
      clue,
      answer,
      letterCount: answer.length,
      updatedAt: serverTimestamp(),
    });
    activeEditId = null;
    setActionMessage('Entry updated.');
    await loadEntries();
  } catch (error) {
    console.error('Firestore update error:', error);
    setActionMessage('Could not update entry right now.', true);
  }
}

async function deleteEntry(entryId) {
  const confirmed = globalThis.confirm('Delete this entry permanently?');
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'crosswordClues', entryId));
    activeEditId = null;
    setActionMessage('Entry deleted.');
    await loadEntries();
  } catch (error) {
    console.error('Firestore delete error:', error);
    setActionMessage('Could not delete entry right now.', true);
  }
}

async function loadEntries() {
  if (listStatus) setListStatus('Loading clues...');

  try {
    const snapshot = await getDocs(cluesRef);
    entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    rebuildLengthFilter();
    renderPatternBoxes();
    renderClues();
  } catch (error) {
    console.error('Firestore load error:', error);
    setListStatus('Could not load clues right now.', true);
  }
}

if (entryForm) {
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
      setFlashMessage('New entry saved.');
    } catch (error) {
      console.error('Firestore save error:', error);
      setFormMessage('Could not save entry right now.', true);
    }
  });
}

if (clueList) {
  clueList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const item = button.closest('li[data-entry-id]');
    if (!item) return;

    const entryId = item.dataset.entryId;
    const action = button.dataset.action;

    if (action === 'edit') {
      activeEditId = entryId;
      renderClues();
      return;
    }

    if (action === 'cancel-edit') {
      activeEditId = null;
      setActionMessage('Edit cancelled.');
      renderClues();
      return;
    }

    if (action === 'save-edit') {
      const editClue = item.querySelector('.edit-clue');
      const editAnswer = item.querySelector('.edit-answer');
      await updateEntry(entryId, editClue?.value || '', editAnswer?.value || '');
      return;
    }

    if (action === 'delete') {
      await deleteEntry(entryId);
    }
  });
}

if (answerInput) {
  answerInput.addEventListener('input', updateCountPreview);
}

if (lengthFilter) {
  lengthFilter.addEventListener('change', () => {
    knownLetters = [];
    renderPatternBoxes();
    renderClues();
  });
}

if (clueSearch) {
  clueSearch.addEventListener('input', () => {
    renderClues();
  });
}

const flash = consumeFlashMessage();
if (flash) {
  setActionMessage(flash.message, flash.isError);
}

if (pageType === 'add') {
  updateCountPreview();
}

if (pageType === 'solve') {
  loadEntries();
}
