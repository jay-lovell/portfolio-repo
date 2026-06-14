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
const categoryInput = document.getElementById('category-input');
const categorySuggestions = document.getElementById('category-suggestions');
const answerInput = document.getElementById('answer-input');
const letterCountOutput = document.getElementById('letter-count-output');
const formMessage = document.getElementById('form-message');

const categoryFilter = document.getElementById('category-filter');
const lengthFilter = document.getElementById('length-filter');
const clueSearch = document.getElementById('clue-search');
const patternBoxes = document.getElementById('pattern-boxes');
const clueList = document.getElementById('clue-list');
const statusMessage = document.getElementById('status-message');

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

function parsePatternSegments(patternValue) {
  const raw = String(patternValue || '').trim();
  if (!raw) return [];
  const segments = raw
    .split(',')
    .map(segment => Number(segment.trim()))
    .filter(segment => Number.isInteger(segment) && segment > 0);
  return segments;
}

function patternFromSegments(segments) {
  return segments.join(',');
}

function totalFromSegments(segments) {
  return segments.reduce((total, segment) => total + segment, 0);
}

function breakpointsFromSegments(segments) {
  let running = 0;
  return segments.slice(0, -1).map(segment => {
    running += segment;
    return running;
  });
}

function formatAnswerWithSegments(answer, segments) {
  if (!answer) return '';
  if (!segments.length) return answer;
  if (totalFromSegments(segments) !== answer.length) return answer;

  let cursor = 0;
  const words = segments.map(segment => {
    const word = answer.slice(cursor, cursor + segment);
    cursor += segment;
    return word;
  });
  return words.join(' ');
}

function parseAnswerInput(rawValue) {
  const words = String(rawValue)
    .toUpperCase()
    .match(/[A-Z]+/g) || [];

  const answer = words.join('');
  const segments = words.map(word => word.length);
  const answerPattern = patternFromSegments(segments);

  return {
    answer,
    letterCount: answer.length,
    answerPattern,
    segments,
    answerDisplay: words.join(' '),
  };
}

function normalizeEntry(rawEntry) {
  const answer = String(rawEntry.answer || '').toUpperCase().replace(/[^A-Z]/g, '');
  const fallbackCount = Number(rawEntry.letterCount) || answer.length;
  let segments = parsePatternSegments(rawEntry.answerPattern);
  if (!segments.length && fallbackCount > 0) segments = [fallbackCount];
  if (segments.length && totalFromSegments(segments) !== answer.length && answer.length) {
    segments = [answer.length];
  }

  const answerPattern = segments.length ? patternFromSegments(segments) : String(answer.length);
  const letterCount = answer.length;

  return {
    ...rawEntry,
    answer,
    letterCount,
    answerPattern,
    answerDisplay: formatAnswerWithSegments(answer, segments),
    breakpoints: breakpointsFromSegments(segments),
    category: rawEntry.category ? String(rawEntry.category).trim() : 'Uncategorised',
  };
}

function updateCountPreview() {
  if (!answerInput || !letterCountOutput) return;
  const parsed = parseAnswerInput(answerInput.value);
  if (!parsed.answer) {
    letterCountOutput.value = '0';
    return;
  }
  const patternText = parsed.answerPattern.includes(',') ? ` (${parsed.answerPattern})` : '';
  letterCountOutput.value = `${parsed.letterCount}${patternText}`;
}

function setFormMessage(message, isError = false) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.style.color = isError ? '#c0392b' : '';
}

function setStatus(message, isError = false) {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#c0392b' : '';
}

function sortByLengthThenClue(list) {
  return [...list].sort((a, b) => {
    if (a.letterCount !== b.letterCount) return a.letterCount - b.letterCount;
    if (a.answerPattern !== b.answerPattern) return a.answerPattern.localeCompare(b.answerPattern);
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
  const patterns = [...new Set(entries.map(entry => entry.answerPattern))].sort((a, b) => {
    const aSegments = parsePatternSegments(a);
    const bSegments = parsePatternSegments(b);
    const totalDiff = totalFromSegments(aSegments) - totalFromSegments(bSegments);
    if (totalDiff !== 0) return totalDiff;
    if (aSegments.length !== bSegments.length) return aSegments.length - bSegments.length;
    return a.localeCompare(b);
  });

  lengthFilter.innerHTML = '<option value="all">All answers</option>';
  patterns.forEach(pattern => {
    const segments = parsePatternSegments(pattern);
    const total = totalFromSegments(segments);
    const option = document.createElement('option');
    option.value = pattern;
    option.textContent = pattern.includes(',') ? `${total} letters (${pattern})` : `${total} letters`;
    lengthFilter.append(option);
  });

  if (current !== 'all' && patterns.includes(current)) {
    lengthFilter.value = current;
  }
}

function rebuildCategoryFilter() {
  if (!categoryFilter) return;
  const current = categoryFilter.value;
  const categories = [...new Set(entries.map(entry => entry.category))].sort((a, b) => {
    if (a === 'Uncategorised') return 1;
    if (b === 'Uncategorised') return -1;
    return a.localeCompare(b);
  });

  categoryFilter.innerHTML = '<option value="all">All categories</option>';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.append(option);
  });

  if (current !== 'all' && categories.includes(current)) {
    categoryFilter.value = current;
  }
}

function populateCategorySuggestions() {
  const categories = [...new Set(entries.map(entry => entry.category))]
    .filter(c => c !== 'Uncategorised')
    .sort((a, b) => a.localeCompare(b));

  [categorySuggestions, document.getElementById('edit-cat-suggestions')].forEach(dl => {
    if (!dl) return;
    dl.innerHTML = '';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      dl.append(option);
    });
  });
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
  const segments = parsePatternSegments(lengthFilter.value);
  const selectedLength = totalFromSegments(segments);

  if (!selectedLength) {
    knownLetters = [];
    return;
  }

  if (knownLetters.length !== selectedLength) {
    knownLetters = Array.from({ length: selectedLength }, (_, index) => knownLetters[index] || '');
  }
  const breakpoints = breakpointsFromSegments(segments);

  knownLetters.forEach((letter, index) => {
    const input = document.createElement('input');
    input.className = 'letter-box';
    input.maxLength = 1;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.dataset.index = String(index);
    input.value = letter;
    input.setAttribute('aria-label', `Letter ${index + 1} of ${knownLetters.length}`);

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
    if (segments.length > 1 && breakpoints.includes(index + 1)) {
      const gap = document.createElement('span');
      gap.className = 'word-gap';
      gap.setAttribute('aria-hidden', 'true');
      patternBoxes.append(gap);
    }
  });
}

function getFilteredEntries() {
  const selectedPattern = lengthFilter?.value || 'all';
  const selectedCategory = categoryFilter?.value || 'all';
  const searchValue = clueSearch?.value.trim().toLowerCase() || '';

  return entries.filter(entry => {
    if (selectedCategory !== 'all' && entry.category !== selectedCategory) {
      return false;
    }

    if (selectedPattern !== 'all' && entry.answerPattern !== selectedPattern) {
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
    setStatus('No clues match the current filters. Try another pattern or length.');
    return;
  }

  setStatus(`${filtered.length} clue${filtered.length === 1 ? '' : 's'} shown.`);

  const grouped = new Map();
  filtered.forEach(entry => {
    if (!grouped.has(entry.answerPattern)) grouped.set(entry.answerPattern, []);
    grouped.get(entry.answerPattern).push(entry);
  });

  [...grouped.keys()].sort((a, b) => {
    const aSegments = parsePatternSegments(a);
    const bSegments = parsePatternSegments(b);
    const totalDiff = totalFromSegments(aSegments) - totalFromSegments(bSegments);
    if (totalDiff !== 0) return totalDiff;
    if (aSegments.length !== bSegments.length) return aSegments.length - bSegments.length;
    return a.localeCompare(b);
  }).forEach(pattern => {
    const section = document.createElement('section');
    section.className = 'group';
    const patternLength = totalFromSegments(parsePatternSegments(pattern));
    section.innerHTML = `<h3>${pattern.includes(',') ? `${patternLength} letters (${pattern})` : `${patternLength} letters`}</h3>`;
    const list = document.createElement('ul');

    grouped.get(pattern).forEach(entry => {
      const item = document.createElement('li');
      item.dataset.entryId = entry.id;

      if (activeEditId === entry.id) {
        item.className = 'editing-item';
        const catValue = entry.category === 'Uncategorised' ? '' : entry.category;
        item.innerHTML = `
          <div class="entry-edit-grid">
            <label for="edit-clue-${entry.id}">Clue</label>
            <input id="edit-clue-${entry.id}" class="edit-clue" type="text" maxlength="200" value="${escapeAttribute(entry.clue)}" />
            <label for="edit-category-${entry.id}">Category</label>
            <input id="edit-category-${entry.id}" class="edit-category" type="text" maxlength="60" list="edit-cat-suggestions" value="${escapeAttribute(catValue)}" />
            <label for="edit-answer-${entry.id}">Answer</label>
            <input id="edit-answer-${entry.id}" class="edit-answer" type="text" maxlength="80" value="${escapeAttribute(entry.answerDisplay)}" />
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
            <span class="answer-text">${entry.answerDisplay || entry.answer}</span>
          </div>
          <div class="entry-actions">
            <span class="count-pill">${entry.answerPattern.includes(',') ? `(${entry.answerPattern})` : entry.letterCount}</span>
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

async function updateEntry(entryId, clueValue, answerValue, categoryValue) {
  const clue = clueValue.trim();
  const category = (categoryValue || '').trim();
  const parsedAnswer = parseAnswerInput(answerValue);
  const { answer, letterCount, answerPattern } = parsedAnswer;

  if (!clue || !answer) {
    setStatus('Provide both a clue and a valid answer using letters (spaces allowed between words).', true);
    return;
  }

  try {
    await updateDoc(doc(db, 'crosswordClues', entryId), {
      clue,
      answer,
      letterCount,
      answerPattern,
      category: category || '',
      updatedAt: serverTimestamp(),
    });
    activeEditId = null;
    setStatus('Entry updated.');
    await loadEntries();
  } catch (error) {
    console.error('Firestore update error:', error);
    setStatus('Could not update entry right now.', true);
  }
}

async function deleteEntry(entryId) {
  const confirmed = globalThis.confirm('Delete this entry permanently?');
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'crosswordClues', entryId));
    activeEditId = null;
    setStatus('Entry deleted.');
    await loadEntries();
  } catch (error) {
    console.error('Firestore delete error:', error);
    setStatus('Could not delete entry right now.', true);
  }
}

async function loadEntries() {
  if (statusMessage) setStatus('Loading clues...');

  try {
    const snapshot = await getDocs(cluesRef);
    entries = snapshot.docs.map(doc => normalizeEntry({
      id: doc.id,
      ...doc.data(),
    }));

    rebuildCategoryFilter();
    rebuildLengthFilter();
    populateCategorySuggestions();
    renderPatternBoxes();
    renderClues();
  } catch (error) {
    console.error('Firestore load error:', error);
    setStatus('Could not load clues right now.', true);
  }
}

if (entryForm) {
  entryForm.addEventListener('submit', async event => {
    event.preventDefault();
    setFormMessage('');

    const clue = clueInput.value.trim();
    const category = (categoryInput?.value || '').trim();
    const parsedAnswer = parseAnswerInput(answerInput.value);
    const { answer, letterCount, answerPattern } = parsedAnswer;

    if (!clue || !answer) {
      setFormMessage('Enter both a clue and answer (spaces are fine).', true);
      return;
    }

    const entry = {
      clue,
      answer,
      letterCount,
      answerPattern,
      category: category || '',
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(cluesRef, entry);
      clueInput.value = '';
      if (categoryInput) categoryInput.value = '';
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
      setStatus('Edit cancelled.');
      renderClues();
      return;
    }

    if (action === 'save-edit') {
      const editClue = item.querySelector('.edit-clue');
      const editAnswer = item.querySelector('.edit-answer');
      const editCategory = item.querySelector('.edit-category');
      await updateEntry(entryId, editClue?.value || '', editAnswer?.value || '', editCategory?.value || '');
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

if (categoryFilter) {
  categoryFilter.addEventListener('change', () => {
    renderClues();
  });
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
  setStatus(flash.message, flash.isError);
}

if (pageType === 'add') {
  updateCountPreview();
  loadEntries();
}

if (pageType === 'solve') {
  loadEntries();
}
