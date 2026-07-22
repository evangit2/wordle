// Wordle Game Logic

let WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const WORDS_URL = 'words.json';

let targetWord = '';
let currentRow = 0;
let currentCol = 0;
let guesses = [];
let gameState = 'playing'; // playing, won, lost
let letterStates = {}; // for keyboard coloring

// Initialize
init();

async function init() {
  loadStats();
  await loadWord();
  buildBoard();
  buildKeyboard();
  loadGameState();
  attachListeners();
}

// Get today's date in YYYY-MM-DD format
function getToday() {
  return new Date().toISOString().split('T')[0];
}

// Load the word from words.json
async function loadWord() {
  try {
    const resp = await fetch(WORDS_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const data = await resp.json();
    const words = data.words || [];
    
    if (words.length === 0) {
      targetWord = 'WORLD';
      WORD_LENGTH = 5;
      return;
    }
    
    // Find today's word
    const today = getToday();
    const todayEntry = words.find(w => w.date === today);
    
    let entry;
    if (todayEntry) {
      entry = todayEntry;
    } else {
      // Fall back to the most recent word
      const sorted = [...words].sort((a, b) => b.date.localeCompare(a.date));
      entry = sorted.find(w => w.date <= today) || sorted[0];
    }
    
    targetWord = entry.word.toUpperCase();
    WORD_LENGTH = entry.length || entry.word.length || 5;
  } catch (e) {
    console.error('Failed to load word:', e);
    targetWord = 'WORLD';
    WORD_LENGTH = 5;
  }
}

// Build the game board
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${WORD_LENGTH}, 1fr)`;
  board.style.aspectRatio = `${WORD_LENGTH} / ${MAX_GUESSES + 0.4}`;
  
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'board-row';
    row.id = `row-${r}`;
    row.style.gridTemplateColumns = `repeat(${WORD_LENGTH}, 1fr)`;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
  
  // Adjust tile font size based on word length
  let fontSize = 28;
  if (WORD_LENGTH >= 7) fontSize = 22;
  else if (WORD_LENGTH >= 6) fontSize = 25;
  document.documentElement.style.setProperty('--tile-font', fontSize + 'px');
}

// Build the on-screen keyboard
function buildKeyboard() {
  const keyboard = document.getElementById('keyboard');
  keyboard.innerHTML = '';
  
  const layout = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','BACK']
  ];
  
  layout.forEach(rowKeys => {
    const row = document.createElement('div');
    row.className = 'keyboard-row';
    rowKeys.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'key' + (key.length > 1 ? ' wide' : '');
      btn.textContent = key === 'BACK' ? '⌫' : key;
      btn.setAttribute('data-key', key);
      btn.addEventListener('click', () => handleKey(key));
      row.appendChild(btn);
    });
    keyboard.appendChild(row);
  });
}

// Handle key input
function handleKey(key) {
  if (gameState !== 'playing') return;
  
  if (key === 'ENTER') {
    submitGuess();
  } else if (key === 'BACK' || key === 'BACKSPACE') {
    deleteLetter();
  } else if (key.length === 1 && /[A-Z]/.test(key)) {
    addLetter(key);
  }
}

// Add a letter
function addLetter(letter) {
  if (currentCol >= WORD_LENGTH) return;
  
  const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
  tile.textContent = letter;
  tile.classList.add('filled');
  currentCol++;
}

// Delete a letter
function deleteLetter() {
  if (currentCol === 0) return;
  
  currentCol--;
  const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
  tile.textContent = '';
  tile.classList.remove('filled');
}

// Submit guess
function submitGuess() {
  if (currentCol < WORD_LENGTH) {
    showToast('Not enough letters');
    shakeRow();
    return;
  }
  
  let guess = '';
  for (let c = 0; c < WORD_LENGTH; c++) {
    guess += document.getElementById(`tile-${currentRow}-${c}`).textContent;
  }
  
  // Check if word is valid (always allow the target word itself)
  if (typeof VALID_WORDS !== 'undefined' && VALID_WORDS.length > 0) {
    if (guess.toLowerCase() !== targetWord.toLowerCase() && !VALID_WORDS.includes(guess.toLowerCase())) {
      showToast('Not in word list');
      shakeRow();
      return;
    }
  }
  
  // Evaluate the guess
  const result = evaluateGuess(guess, targetWord);
  guesses.push({ word: guess, result });
  
  // Animate tiles
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = document.getElementById(`tile-${currentRow}-${c}`);
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.classList.add(result[c]);
        updateKeyboard(guess[c], result[c]);
      }, 300);
    }, c * 150);
  }
  
  // Check win/lose after animation
  setTimeout(() => {
    if (guess === targetWord) {
      gameState = 'won';
      bounceRow();
      showToast('🎉 Correct!', 2000);
      updateStats(true, currentRow + 1);
      saveGameState();
      setTimeout(() => showStats(), 2000);
    } else if (currentRow + 1 >= MAX_GUESSES) {
      gameState = 'lost';
      showToast(`The word was: ${targetWord}`, 3000);
      updateStats(false, 0);
      saveGameState();
      setTimeout(() => showStats(), 2000);
    } else {
      currentRow++;
      currentCol = 0;
      saveGameState();
    }
  }, WORD_LENGTH * 150 + 350);
}

// Evaluate guess against target
function evaluateGuess(guess, target) {
  const result = new Array(WORD_LENGTH).fill('absent');
  const targetArr = target.split('');
  const guessArr = guess.split('');
  
  // First pass: find correct letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct';
      targetArr[i] = null;
    }
  }
  
  // Second pass: find present letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    const idx = targetArr.indexOf(guessArr[i]);
    if (idx !== -1) {
      result[i] = 'present';
      targetArr[idx] = null;
    }
  }
  
  return result;
}

// Update keyboard colors
function updateKeyboard(letter, state) {
  const key = document.querySelector(`.key[data-key="${letter}"]`);
  if (!key) return;
  
  // Don't downgrade: correct > present > absent
  const current = letterStates[letter];
  if (current === 'correct') return;
  if (current === 'present' && state === 'absent') return;
  
  letterStates[letter] = state;
  key.classList.remove('correct', 'present', 'absent');
  key.classList.add(state);
}

// Shake row for invalid input
function shakeRow() {
  const row = document.getElementById(`row-${currentRow}`);
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 400);
}

// Bounce row for win
function bounceRow() {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = document.getElementById(`tile-${currentRow}-${c}`);
    setTimeout(() => {
      tile.classList.add('bounce');
    }, c * 100);
  }
}

// Show toast message
function showToast(msg, duration = 1500) {
  const container = document.getElementById('message-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Stats
function loadStats() {
  const saved = localStorage.getItem('wordle-stats');
  return saved ? JSON.parse(saved) : { played: 0, won: 0, streak: 0, maxStreak: 0, guessDist: [0,0,0,0,0,0] };
}

function updateStats(won, guessCount) {
  const stats = loadStats();
  stats.played++;
  if (won) {
    stats.won++;
    stats.streak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.guessDist[guessCount - 1]++;
  } else {
    stats.streak = 0;
  }
  localStorage.setItem('wordle-stats', JSON.stringify(stats));
}

function showStats() {
  const stats = loadStats();
  const winPct = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const maxDist = Math.max(...stats.guessDist, 1);
  
  const body = document.getElementById('stats-body');
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-num">${stats.played}</div><div class="stat-label">Played</div></div>
      <div class="stat-box"><div class="stat-num">${winPct}</div><div class="stat-label">Win %</div></div>
      <div class="stat-box"><div class="stat-num">${stats.streak}</div><div class="stat-label">Cur Streak</div></div>
      <div class="stat-box"><div class="stat-num">${stats.maxStreak}</div><div class="stat-label">Max Streak</div></div>
    </div>
    <div class="stats-distribution">
      <h3>Guess Distribution</h3>
      ${stats.guessDist.map((count, i) => `
        <div class="dist-row">
          <div class="dist-label">${i + 1}</div>
          <div class="dist-bar" style="width: ${Math.max((count / maxDist) * 100, 8)}%">${count}</div>
        </div>
      `).join('')}
    </div>
    <div style="text-align:center; margin-top:20px; display:flex; gap:8px; justify-content:center;">
      <button class="icon-btn" style="background:#3a3a3c; padding:12px 24px; border-radius:6px; font-size:16px;" onclick="closeModal('stats-modal')">Close</button>
    </div>
  `;
  
  document.getElementById('stats-modal').classList.remove('hidden');
}

// Clear all data
function clearData() {
  // Remove stats
  localStorage.removeItem('wordle-stats');
  // Remove today's game state
  localStorage.removeItem(`wordle-game-${getToday()}`);
  // Show toast and reload
  showToast('Data cleared! Refreshing...', 1500);
  setTimeout(() => location.reload(), 1000);
}

// Save/restore game state (per day)
function saveGameState() {
  const key = `wordle-game-${getToday()}`;
  localStorage.setItem(key, JSON.stringify({
    guesses,
    currentRow,
    currentCol,
    gameState,
    targetWord,
    wordLength: WORD_LENGTH,
    letterStates
  }));
}

function loadGameState() {
  const key = `wordle-game-${getToday()}`;
  const saved = localStorage.getItem(key);
  if (!saved) return;
  
  try {
    const state = JSON.parse(saved);
    if (state.targetWord !== targetWord) return; // word changed, fresh game
    if (state.wordLength && state.wordLength !== WORD_LENGTH) return; // length changed, fresh game
    
    guesses = state.guesses || [];
    currentRow = state.currentRow || 0;
    currentCol = state.currentCol || 0;
    gameState = state.gameState || 'playing';
    letterStates = state.letterStates || {};
    
    // Rebuild board from saved state
    for (let r = 0; r < guesses.length; r++) {
      const g = guesses[r];
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${r}-${c}`);
        tile.textContent = g.word[c];
        tile.classList.add('filled', g.result[c]);
      }
    }
    
    // Rebuild keyboard
    for (const [letter, state] of Object.entries(letterStates)) {
      const key = document.querySelector(`.key[data-key="${letter}"]`);
      if (key) key.classList.add(state);
    }
    
    // If game ended, show stats
    if (gameState !== 'playing') {
      setTimeout(() => showStats(), 500);
    }
  } catch (e) {
    console.error('Failed to restore game state:', e);
  }
}

// Modal helpers
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Event listeners
function attachListeners() {
  // Physical keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { handleKey('ENTER'); e.preventDefault(); }
    else if (e.key === 'Backspace') { handleKey('BACK'); e.preventDefault(); }
    else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) { handleKey(e.key.toUpperCase()); }
  });
  
  // Help button
  document.getElementById('help-btn').addEventListener('click', () => {
    document.getElementById('help-modal').classList.remove('hidden');
  });
  
  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('hidden');
  });
  
  // Admin link (inside settings modal)
  const adminLink = document.getElementById('admin-link-modal');
  if (adminLink) {
    adminLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'admin.html';
    });
  }
  
  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}
