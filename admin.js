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
  
  // Fill the LLM prompt textarea
  document.getElementById('llm-prompt').value = buildLlmPrompt();
  
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
  document.getElementById('gh-owner').value = s.owner || 'evangit2';
  document.getElementById('gh-repo').value = s.repo || 'wordle';
  document.getElementById('gh-branch').value = s.branch || 'main';
  document.getElementById('gh-token').value = s.token || '';
  document.getElementById('pages-url').value = s.pagesUrl || 'https://evangit2.github.io/wordle/';
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
const WORDS_URL = 'words.json';
async function fetchWordsFile() {
  const s = getSettings();
  if (!s.token) throw new Error('No GitHub token configured. Go to Settings tab.');
  
  const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${WORDS_FILE}?ref=${s.branch}&t=${Date.now()}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `token ${s.token}`, 'Accept': 'application/vnd.github.v3+json' },
    cache: 'no-store'
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
    const resp = await fetch(WORDS_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const data = await resp.json();
    currentWords = data.words || [];
  } catch {
    currentWords = [];
  }
  renderWordList();
}

// Calendar state: month currently displayed (YYYY, M where M is 0-indexed)
let calYear = parseInt(getToday().slice(0, 4));
let calMonth = parseInt(getToday().slice(5, 7)) - 1;
let calSelected = null; // date string of the tapped day

const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Navigate months
function calNav(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear -= 1; }
  if (calMonth > 11) { calMonth = 0; calYear += 1; }
  renderCalendar();
}

// Jump back to current month
function calToday() {
  const t = getToday();
  calYear = parseInt(t.slice(0, 4));
  calMonth = parseInt(t.slice(5, 7)) - 1;
  renderCalendar();
}

// Date string for a cell
function calDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Render the mini calendar
function renderCalendar() {
  const container = document.getElementById('calendar');
  const title = document.getElementById('cal-title');
  if (!container) return;
  
  const today = getToday();
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  
  title.textContent = `${CAL_MONTHS[calMonth]} ${calYear}`;
  
  const byDate = {};
  currentWords.forEach(w => { byDate[w.date] = w; });
  
  let html = '<div class="cal-row cal-dow">';
  ['S','M','T','W','T','F','S'].forEach(d => html += `<div class="cal-dow-cell">${d}</div>`);
  html += '</div>';
  
  let day = 1 - firstDay;
  while (day <= daysInMonth) {
    html += '<div class="cal-row">';
    for (let i = 0; i < 7; i++, day++) {
      if (day < 1 || day > daysInMonth) {
        html += '<div class="cal-cell cal-empty"></div>';
      } else {
        const ds = calDateStr(calYear, calMonth, day);
        const entry = byDate[ds];
        const classes = ['cal-cell'];
        if (ds === today) classes.push('cal-today');
        if (ds === calSelected) classes.push('cal-selected');
        if (entry) classes.push('cal-scheduled');
        html += `<div class="${classes.join(' ')}" onclick="calPick('${ds}')" title="${entry ? entry.word : ''}">
          <span class="cal-day-num">${day}</span>
          ${entry ? `<span class="cal-word">${entry.word}</span>` : ''}
        </div>`;
      }
    }
    html += '</div>';
  }
  
  container.innerHTML = html;
}

// Tap a day: prefill the Add Word form with that date, focus the word input
function calPick(dateStr) {
  calSelected = dateStr;
  renderCalendar();
  document.getElementById('new-date').value = dateStr;
  const existing = currentWords.find(w => w.date === dateStr);
  if (existing) {
    document.getElementById('new-word').value = existing.word;
    showAdminMessage(`Editing ${dateStr} (current: ${existing.word}) — type a new word & tap Add`, 'info');
  } else {
    document.getElementById('new-word').value = '';
    showAdminMessage(`Scheduling for ${dateStr} — enter a word & tap Add Word`, 'info');
  }
  document.getElementById('new-word').focus();
  document.getElementById('new-word').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  
  container.innerHTML = sorted.map((entry) => {
    const isToday = entry.date === today;
    const idx = currentWords.indexOf(entry);
    return `
      <div class="word-item ${isToday ? 'today' : ''}" data-idx="${idx}">
        <span class="date-label">${entry.date}</span>
        ${isToday ? '<span class="today-badge">TODAY</span>' : ''}
        <input type="text" value="${entry.word}" 
          oninput="this.value=this.value.toUpperCase()"
          onchange="updateWord(${idx}, this.value)">
        <button class="delete-btn" onclick="deleteWord(${idx})">🗑</button>
      </div>
    `;
  }).join('');
  renderCalendar();
}

// Add a new word
async function addWord() {
  const word = document.getElementById('new-word').value.trim().toUpperCase();
  const date = document.getElementById('new-date').value || getToday();
  const length = word.length;
  
  if (length < 3 || length > 8 || !/^[A-Z]+$/.test(word)) {
    showAdminMessage('Word must be 3–8 letters (A–Z only)', 'error');
    return;
  }
  
  // Check if there's already a word for this date
  const existingIdx = currentWords.findIndex(w => w.date === date);
  if (existingIdx !== -1) {
    currentWords[existingIdx].word = word;
    currentWords[existingIdx].length = length;
  } else {
    currentWords.push({ word, date, length });
  }
  
  await saveToGitHub();
  
  document.getElementById('new-word').value = '';
  renderWordList();
}

// Quick add for today
async function addWordForToday() {
  document.getElementById('new-date').value = getToday();
  await addWord();
}

// Update a word inline
async function updateWord(idx, newWord) {
  newWord = newWord.trim().toUpperCase();
  if (newWord.length < 3 || newWord.length > 8 || !/^[A-Z]+$/.test(newWord)) {
    showAdminMessage('Word must be 3–8 letters (A–Z only)', 'error');
    loadWords(); // reload to revert
    return;
  }
  currentWords[idx].word = newWord;
  currentWords[idx].length = newWord.length;
  await saveToGitHub();
}

// ===== AI Bulk Generate =====

// Build the LLM prompt for generating 6 months of daily words
function buildLlmPrompt() {
  const today = getToday();
  const end = new Date();
  end.setDate(end.getDate() + 182);
  const endStr = end.toISOString().slice(0, 10);
  
  return `You are generating daily puzzle words for a Virginia Tech safety-themed Wordle game.

Generate one word per day, every day, from ${today} through ${endStr} (about 6 months).

THEME — words must be oriented toward at least one of:
- Virginia Tech (culture, campus, traditions, landmarks)
- Virginia Tech public safety
- Environmental Health & Safety (EHS) at Virginia Tech
- Emergency management
- Hokie Passport (Virginia Tech ID card office)
- Virginia Tech Rescue Squad
- Virginia Tech Police

You may search the web for Virginia Tech terms, building names, EHS vocabulary, etc. to make the words authentic.

RULES:
- Each word must be 4 to 8 letters, A-Z only (no spaces, hyphens, or digits)
- UPPERCASE every word
- No duplicate words across the whole list
- Mix themes day to day (don't do 10 EHS words in a row)
- Words should be guessable and fun: real terms, acronyms count if well-known at VT (like HOKIE, CASHH, TORG)
- Do NOT use offensive or sensitive terms

OUTPUT — respond with ONLY a JSON code block, nothing else, in exactly this format:
{
  "words": [
    { "word": "HOKIE", "date": "${today}", "length": 5 },
    { "word": "SAFETY", "date": "<next day>", "length": 6 }
  ]
}

Dates must be consecutive calendar days in YYYY-MM-DD format. Length must equal the word's letter count. No commentary before or after the JSON.`;
}

// Copy the prompt to clipboard
function copyLlmPrompt() {
  const ta = document.getElementById('llm-prompt');
  ta.select();
  ta.setSelectionRange(0, 99999);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  if (!ok && navigator.clipboard) {
    navigator.clipboard.writeText(ta.value).then(() => {
      showAdminMessage('Prompt copied to clipboard!', 'success');
    }).catch(() => {
      showAdminMessage('Copy failed — select the text manually', 'error');
    });
    return;
  }
  showAdminMessage(ok ? 'Prompt copied to clipboard!' : 'Copy failed — select the text manually', ok ? 'success' : 'error');
}

// Import words from pasted LLM JSON
async function importLlmWords() {
  const status = document.getElementById('llm-import-status');
  const raw = document.getElementById('llm-json-input').value.trim();
  
  if (!raw) {
    status.textContent = 'Paste the LLM JSON first.';
    return;
  }
  
  // Strip possible markdown fences
  let text = raw.replace(/^```(json)?\s*/i, '').replace(/\s*```\s*$/, '');
  
  // Grab the first {...} block (LLMs sometimes add chatter around it)
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    status.textContent = '✗ No JSON object found in the pasted text.';
    return;
  }
  text = text.substring(start, end + 1);
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    status.textContent = '✗ Invalid JSON: ' + e.message;
    return;
  }
  
  const words = data.words || data;
  if (!Array.isArray(words) || words.length === 0) {
    status.textContent = '✗ No "words" array found.';
    return;
  }
  
  let added = 0, updated = 0, skipped = 0;
  const seen = new Set();
  
  for (const entry of words) {
    const word = String(entry.word || '').trim().toUpperCase();
    const date = String(entry.date || '').trim();
    const length = word.length;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
    if (length < 3 || length > 8 || !/^[A-Z]+$/.test(word)) { skipped++; continue; }
    
    // Skip duplicates within the paste itself
    const key = word + '|' + date;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    
    const existingIdx = currentWords.findIndex(w => w.date === date);
    if (existingIdx !== -1) {
      currentWords[existingIdx].word = word;
      currentWords[existingIdx].length = length;
      updated++;
    } else {
      currentWords.push({ word, date, length });
      added++;
    }
  }
  
  if (added + updated === 0) {
    status.textContent = `✗ Nothing imported — ${skipped} entries skipped (bad format).`;
    return;
  }
  
  status.textContent = `Importing ${added} new + ${updated} updated words (${skipped} skipped)... saving to GitHub.`;
  await saveToGitHub();
  status.textContent = `✓ Imported ${added} new + ${updated} updated words (${skipped} skipped) — saved to GitHub!`;
  document.getElementById('llm-json-input').value = '';
  renderWordList();
}
// Delete a word
async function deleteWord(idx) {
  currentWords.splice(idx, 1);
  await saveToGitHub();
  renderWordList();
}

// Save to GitHub (with retry on 409 conflict)
async function saveToGitHub() {
  const s = getSettings();
  if (!s.token) {
    showAdminMessage('No GitHub token set. Go to Settings.', 'error');
    return;
  }
  
  showAdminMessage('Saving to GitHub...', 'info');
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Always fetch fresh SHA right before PUT
      const { sha } = await fetchWordsFile();
      const wordsData = { words: currentWords };
      await updateWordsFile(wordsData, sha);
      showAdminMessage('✓ Saved to GitHub!', 'success');
      return;
    } catch (e) {
      if (e.message.includes('409') || e.message.includes('does not match') || e.message.includes('422')) {
        // SHA stale, wait a moment then retry with fresh fetch
        await new Promise(r => setTimeout(r, 500));
        showAdminMessage(`Retrying... (${attempt + 2}/3)`, 'info');
        continue;
      }
      showAdminMessage(`Error: ${e.message}`, 'error');
      await loadWords();
      return;
    }
  }
  
  showAdminMessage('Error: Could not save after 3 attempts. Try again.', 'error');
  await loadWords();
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
  
  // Use qrcodejs (QRCode library)
  new QRCode(display, {
    text: url,
    width: 256,
    height: 256,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  
  // Get the canvas/img for download
  setTimeout(() => {
    const canvas = display.querySelector('canvas');
    const img = display.querySelector('img');
    if (canvas) {
      qrDataUrl = canvas.toDataURL('image/png');
    } else if (img) {
      qrDataUrl = img.src;
    }
    document.getElementById('qr-download').classList.remove('hidden');
  }, 100);
  
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
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.remove('active');
    t.classList.add('hidden');
  });
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  const target = document.getElementById(`tab-${tab}`);
  target.classList.add('active');
  target.classList.remove('hidden');
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
