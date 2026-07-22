// Admin panel logic

const ADMIN_HASH = '97b00582a7ad43badef8096405fafb6729c21669faa2a20dd56c3cdb5b9f9c7f';
const WORDS_FILE = 'words.json';
let currentWords = [];
let qrDataUrl = null;

// SHA-256 using Web Crypto API
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Check password
async function checkPassword() {
  const input = document.getElementById('admin-password').value;
  const hash = await sha256(input);
  
  if (hash === ADMIN_HASH) {
    sessionStorage.setItem('wordle-admin-auth', 'true');
    showAdmin();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = '❌ Wrong password';
    err.classList.remove('hidden');
    document.getElementById('admin-password').value = '';
    setTimeout(() => err.classList.add('hidden'), 2500);
  }
}

// Show admin panel
async function showAdmin() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  
  loadSettings();
  await loadWords();
  
  // Auto-fill QR URL from settings
  const settings = getSettings();
  if (settings.pagesUrl) {
    document.getElementById('qr-url').value = settings.pagesUrl;
  }
  
  // Auto-fill date with today
  document.getElementById('new-date').value = getToday();
}

// Logout
function logout() {
  sessionStorage.removeItem('wordle-admin-auth');
  location.reload();
}

// Check auth on load
(async function() {
  if (sessionStorage.getItem('wordle-admin-auth') === 'true') {
    showAdmin();
  }
})();

// Get today's date
function getToday() {
  return new Date().toISOString().split('T')[0];
}

// Settings management
function getSettings() {
  return JSON.parse(localStorage.getItem('wordle-admin-settings') || '{}');
}

function loadSettings() {
  const s = getSettings();
  document.getElementById('gh-owner').value = s.owner || '';
  document.getElementById('gh-repo').value = s.repo || '';
  document.getElementById('gh-branch').value = s.branch || 'main';
  document.getElementById('gh-token').value = s.token || '';
  document.getElementById('pages-url').value = s.pagesUrl || '';
}

function saveSettings() {
  const settings = {
    owner: document.getElementById('gh-owner').value.trim(),
    repo: document.getElementById('gh-repo').value.trim(),
    branch: document.getElementById('gh-branch').value.trim() || 'main',
    token: document.getElementById('gh-token').value.trim(),
    pagesUrl: document.getElementById('pages-url').value.trim()
  };
  localStorage.setItem('wordle-admin-settings', JSON.stringify(settings));
  
  const msg = document.getElementById('settings-saved');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
  
  // Update QR URL if pages URL was set
  if (settings.pagesUrl) {
    document.getElementById('qr-url').value = settings.pagesUrl;
  }
}

// GitHub API: get current words.json
async function fetchWordsFile() {
  const s = getSettings();
  if (!s.token) throw new Error('No GitHub token configured. Go to Settings tab.');
  
  const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${WORDS_FILE}?ref=${s.branch}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `token ${s.token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  
  if (resp.status === 404) {
    return { content: null, sha: null };
  }
  
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
  
  const data = await resp.json();
  const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
  return { content, sha: data.sha };
}

// GitHub API: update words.json
async function updateWordsFile(wordsData, sha) {
  const s = getSettings();
  if (!s.token) throw new Error('No GitHub token configured. Go to Settings tab.');
  
  const content = btoa(JSON.stringify(wordsData, null, 2));
  const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${WORDS_FILE}`;
  
  const body = {
    message: `Update words.json - ${getToday()}`,
    content: content,
    branch: s.branch,
    sha: sha || undefined
  };
  
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `token ${s.token}`, 'Accept': 'application/vnd.github.v3+json' },
    body: JSON.stringify(body)
  });
  
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`GitHub API error: ${err.message || resp.status}`);
  }
  
  return await resp.json();
}

// Load words from GitHub (or fall back to local words.json)
async function loadWords() {
  try {
    const { content, sha } = await fetchWordsFile();
    if (content) {
      currentWords = content.words || [];
      renderWordList();
      return;
    }
  } catch (e) {
    // Fall back to fetching words.json directly (read-only mode)
  }
  
  // Fallback: fetch words.json from the site
  try {
    const resp = await fetch(WORDS_URL + '?t=' + Date.now());
    const data = await resp.json();
    currentWords = data.words || [];
  } catch {
    currentWords = [];
  }
  renderWordList();
}

// Render the word list with editable fields
function renderWordList() {
  const container = document.getElementById('word-list');
  const today = getToday();
  
  if (currentWords.length === 0) {
    container.innerHTML = '<p class="hint">No words yet. Add one above.</p>';
    return;
  }
  
  // Sort by date descending
  const sorted = [...currentWords].sort((a, b) => b.date.localeCompare(a.date));
  
  container.innerHTML = sorted.map((entry, idx) => {
    const isToday = entry.date === today;
    return `
      <div class="word-item ${isToday ? 'today' : ''}" data-idx="${currentWords.indexOf(entry)}">
        <span class="date-label">${entry.date}</span>
        ${isToday ? '<span class="today-badge">TODAY</span>' : ''}
        <input type="text" value="${entry.word}" maxlength="5" 
          oninput="this.value=this.value.toUpperCase()"
          onchange="updateWord(${currentWords.indexOf(entry)}, this.value)">
        <button class="delete-btn" onclick="deleteWord(${currentWords.indexOf(entry)})">🗑</button>
      </div>
    `;
  }).join('');
}

// Add a new word
async function addWord() {
  const word = document.getElementById('new-word').value.trim().toUpperCase();
  const date = document.getElementById('new-date').value || getToday();
  
  if (word.length !== 5 || !/[A-Z]{5}/.test(word)) {
    showAdminMessage('Word must be exactly 5 letters', 'error');
    return;
  }
  
  // Check if there's already a word for this date
  const existingIdx = currentWords.findIndex(w => w.date === date);
  if (existingIdx !== -1) {
    currentWords[existingIdx].word = word;
  } else {
    currentWords.push({ word, date });
  }
  
  await saveToGitHub();
  
  document.getElementById('new-word').value = '';
  renderWordList();
}

// Quick add for today
async function addWordForToday() {
  const word = document.getElementById('new-word').value.trim().toUpperCase();
  if (word.length !== 5) {
    showAdminMessage('Word must be exactly 5 letters', 'error');
    return;
  }
  
  document.getElementById('new-date').value = getToday();
  await addWord();
}

// Update a word inline
async function updateWord(idx, newWord) {
  if (newWord.length !== 5) {
    showAdminMessage('Word must be 5 letters', 'error');
    loadWords(); // reload to revert
    return;
  }
  currentWords[idx].word = newWord.toUpperCase();
  await saveToGitHub();
}

// Delete a word
async function deleteWord(idx) {
  currentWords.splice(idx, 1);
  await saveToGitHub();
  renderWordList();
}

// Save to GitHub
async function saveToGitHub() {
  const s = getSettings();
  if (!s.token) {
    showAdminMessage('No GitHub token set. Go to Settings.', 'error');
    return;
  }
  
  showAdminMessage('Saving to GitHub...', 'info');
  
  try {
    const { sha } = await fetchWordsFile();
    const wordsData = { words: currentWords };
    await updateWordsFile(wordsData, sha);
    showAdminMessage('✓ Saved to GitHub!', 'success');
  } catch (e) {
    showAdminMessage(`Error: ${e.message}`, 'error');
    // Reload from GitHub to stay in sync
    await loadWords();
  }
}

// QR Code generation
function generateQR() {
  const url = document.getElementById('qr-url').value.trim();
  if (!url) {
    showAdminMessage('Enter a URL first', 'error');
    return;
  }
  
  const display = document.getElementById('qr-display');
  display.innerHTML = '';
  
  // Generate QR code
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  
  // Create canvas
  const canvas = document.createElement('canvas');
  const cellSize = 6;
  const margin = 4;
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * cellSize;
  
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  
  // Draw modules
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
      }
    }
  }
  
  display.appendChild(canvas);
  
  // Store for download
  qrDataUrl = canvas.toDataURL('image/png');
  
  document.getElementById('qr-download').classList.remove('hidden');
  showAdminMessage('QR code generated!', 'success');
}

// Download QR code
function downloadQR() {
  if (!qrDataUrl) return;
  
  const a = document.createElement('a');
  a.href = qrDataUrl;
  a.download = 'wordle-qr.png';
  a.click();
}

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

// Show admin message (toast)
function showAdminMessage(msg, type = 'info') {
  const el = document.getElementById('admin-message');
  el.textContent = msg;
  el.className = `admin-message show ${type}`;
  
  setTimeout(() => {
    el.classList.remove('show');
  }, type === 'info' ? 60000 : 2500);
}
