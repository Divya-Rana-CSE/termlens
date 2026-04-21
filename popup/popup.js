/**
 * TermLens – popup.js
 * Orchestrates the popup: scrape → analyze → render results.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────
const views = {
  idle:      document.getElementById('view-idle'),
  loading:   document.getElementById('view-loading'),
  notFound:  document.getElementById('view-not-found'),
  error:     document.getElementById('view-error'),
  results:   document.getElementById('view-results'),
};

const $  = id => document.getElementById(id);
const riskBadge     = $('risk-badge');
const loadingSubText = $('loading-sub-text');
const errorMessage  = $('error-message');
const summaryList   = $('summary-list');
const risksList     = $('risks-list');
const noRisks       = $('no-risks');
const risksCount    = $('risks-count');
const cookiesContent = $('cookies-content');
const contentTypeLabel = $('content-type-label');
const sourceHint = $('source-hint');
const sourceToastEl = $('source-toast');

// ── State ─────────────────────────────────────────────────────────────────
let lastScrapeData = null;

// ── Error Messages ────────────────────────────────────────────────────────
const ERROR_MESSAGES = {
  API_KEY_MISSING:    'No Groq API key saved. Click “Groq API key” below (or extension Options), paste your key from console.groq.com, and save.',
  API_KEY_INVALID:    'Invalid API key. Groq keys start with gsk_. Get one at https://console.groq.com/keys',
  API_RATE_LIMITED:   'Rate limit reached. Please wait a moment and try again.',
  API_SERVER_ERROR:   'Groq API server error. Please try again shortly.',
  API_NETWORK_ERROR:  'Could not reach Groq (network or firewall). Check your connection and try again.',
  API_EMPTY_RESPONSE: 'The AI returned an empty response. Please try again.',
  API_PARSE_ERROR:    'Could not parse AI response. Please try again.',
  NO_ACTIVE_TAB:      'Could not get the current tab. Please try reopening the extension.',
  CONTENT_SCRIPT_ERROR: 'Could not communicate with the page. Try refreshing and reopening TermLens.',
  EXTENSION_MESSAGING_ERROR: 'Extension could not reach the background worker. Try reloading the extension on chrome://extensions.',
};

function friendlyError(code) {
  return ERROR_MESSAGES[code] || `Unexpected error: ${code}`;
}

function showSourceToast(msg) {
  if (!sourceToastEl) return;
  sourceToastEl.textContent = msg;
  sourceToastEl.classList.add('visible');
  clearTimeout(showSourceToast._t);
  showSourceToast._t = setTimeout(() => sourceToastEl.classList.remove('visible'), 3200);
}

function hasSummarySourceQuote(data) {
  return (data.summary || []).some(s => {
    const q = typeof s === 'string' ? '' : (s.sourceQuote || '');
    return String(q).trim().length >= 8;
  });
}

function hasRiskSourceQuote(data) {
  return (data.risks || []).some(r => String(r.sourceQuote || '').trim().length >= 8);
}

async function scrollToSourceQuote(quote) {
  const q = String(quote || '').trim();
  if (!q) {
    showSourceToast('No quoted passage linked for this item.');
    return;
  }
  const { termlensTargetTabId } = await chrome.storage.session.get('termlensTargetTabId');
  if (termlensTargetTabId == null) {
    showSourceToast('Run an analysis first, then try again.');
    return;
  }
  chrome.tabs.sendMessage(termlensTargetTabId, { type: 'TERMLENS_SCROLL_TO', quote: q }, response => {
    if (chrome.runtime.lastError) {
      showSourceToast('Open the tab you analyzed and try again.');
      return;
    }
    if (!response?.ok) {
      if (response?.error === 'NOT_FOUND') {
        showSourceToast('Could not find that exact wording — scroll the page or re-analyze.');
      } else {
        showSourceToast('Could not jump to that passage.');
      }
    }
  });
}

// ── View Management ───────────────────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  if (views[name]) views[name].classList.add('active');
}

// ── Tab Switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const panel = document.getElementById(`panel-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');
  });
});

// ── Render Helpers ────────────────────────────────────────────────────────

function renderRiskBadge(level) {
  if (!level) return riskBadge.classList.add('hidden');
  riskBadge.textContent = `${level.toUpperCase()} RISK`;
  riskBadge.className = `risk-badge ${level.toLowerCase()}`;
}

const CONTENT_TYPE_LABELS = {
  terms:   '📄 Terms & Conditions',
  privacy: '🔒 Privacy Policy',
  cookies: '🍪 Cookie Policy',
  mixed:   '📋 Mixed Legal Content',
  unclear: '❓ General Content',
};

function renderSummary(data) {
  contentTypeLabel.textContent = CONTENT_TYPE_LABELS[data.contentType] || '';

  summaryList.innerHTML = '';
  (data.summary || []).slice(0, 5).forEach(item => {
    const point = typeof item === 'string' ? item : (item.point || '');
    const sourceQuote = typeof item === 'string' ? '' : String(item.sourceQuote || '').trim();
    const li = document.createElement('li');
    li.className = 'summary-item';
    li.textContent = point;
    if (sourceQuote.length >= 8) {
      li.classList.add('has-source');
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.title = 'Jump to this passage on the page';
      li.addEventListener('click', () => scrollToSourceQuote(sourceQuote));
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          scrollToSourceQuote(sourceQuote);
        }
      });
    }
    summaryList.appendChild(li);
  });
}

function renderRisks(data) {
  const risks = data.risks || [];
  risksList.innerHTML = '';

  if (risks.length === 0) {
    noRisks.classList.remove('hidden');
    risksCount.style.display = 'none';
    return;
  }

  noRisks.classList.add('hidden');
  risksCount.textContent = risks.length;
  risksCount.style.display = '';

  risks.forEach((risk, i) => {
    const card = document.createElement('div');
    card.className = `risk-card ${risk.severity || 'medium'}`;
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <div class="risk-card-header">
        <span class="risk-label">${escapeHtml(risk.label || 'Risk')}</span>
        <span class="risk-severity ${risk.severity || 'medium'}">${risk.severity || 'medium'}</span>
      </div>
      <p class="risk-detail">${escapeHtml(risk.detail || '')}</p>
    `;
    const sourceQuote = String(risk.sourceQuote || '').trim();
    if (sourceQuote.length >= 8) {
      card.classList.add('has-source');
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.title = 'Jump to supporting passage on the page';
      card.addEventListener('click', () => scrollToSourceQuote(sourceQuote));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          scrollToSourceQuote(sourceQuote);
        }
      });
    }
    risksList.appendChild(card);
  });
}

function renderCookies(data) {
  const cookies = data.cookies || {};
  const accepts = cookies.accept || [];
  const rejects = cookies.reject || [];
  const note    = cookies.note   || '';

  let html = '';

  if (note) {
    html += `<div class="cookie-note">${escapeHtml(note)}</div>`;
  }

  // Accept section
  html += `<div class="cookie-section">
    <p class="cookie-section-title accept">✅ Accept</p>
    <div class="cookie-tags">`;
  if (accepts.length > 0) {
    accepts.forEach((cat, i) => {
      html += `<span class="cookie-tag accept" style="animation-delay:${i*0.06}s">${escapeHtml(cat)}</span>`;
    });
  } else {
    html += `<span class="cookie-empty">No categories identified</span>`;
  }
  html += `</div></div>`;

  // Reject section
  html += `<div class="cookie-section">
    <p class="cookie-section-title reject">🚫 Reject</p>
    <div class="cookie-tags">`;
  if (rejects.length > 0) {
    rejects.forEach((cat, i) => {
      html += `<span class="cookie-tag reject" style="animation-delay:${i*0.06}s">${escapeHtml(cat)}</span>`;
    });
  } else {
    html += `<span class="cookie-empty">No categories identified</span>`;
  }
  html += `</div></div>`;

  cookiesContent.innerHTML = html;
}

function renderResults(data) {
  renderRiskBadge(data.overallRisk);
  renderSummary(data);
  renderRisks(data);
  renderCookies(data);

  if (sourceHint) {
    const show = hasSummarySourceQuote(data) || hasRiskSourceQuote(data);
    sourceHint.classList.toggle('hidden', !show);
  }

  // Reset to summary tab
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-summary').classList.add('active');
  document.getElementById('tab-summary').setAttribute('aria-selected', 'true');
  document.getElementById('panel-summary').classList.add('active');

  showView('results');
}

// ── Core Flow ─────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function scrapeTab(tabId) {
  // Helper: try sending message to content script
  function trySend(resolve, reject) {
    chrome.tabs.sendMessage(tabId, { type: 'TERMLENS_SCRAPE' }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        reject(new Error('CONTENT_SCRIPT_ERROR'));
        return;
      }
      resolve(response.data);
    });
  }

  return new Promise((resolve, reject) => {
    // First attempt — content script might already be there
    chrome.tabs.sendMessage(tabId, { type: 'TERMLENS_SCRAPE' }, response => {
      if (!chrome.runtime.lastError && response?.ok) {
        resolve(response.data);
        return;
      }

      // Content script not injected yet (tab was open before extension loaded).
      // Inject both files programmatically, then retry.
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['utils/scraper.js', 'content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            // Page is probably a chrome:// or extension page — can't inject
            reject(new Error('CONTENT_SCRIPT_ERROR'));
            return;
          }
          // Small delay to let scripts initialise, then retry
          setTimeout(() => trySend(resolve, reject), 150);
        }
      );
    });
  });
}

async function analyzeText(text, hasCookieBanner) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'TERMLENS_ANALYZE', text, hasCookieBanner },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error('EXTENSION_MESSAGING_ERROR'));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || 'UNKNOWN_ERROR'));
          return;
        }
        resolve(response.data);
      }
    );
  });
}

async function runAnalysis(forceAnalyze = false) {
  showView('loading');
  riskBadge.classList.add('hidden');
  loadingSubText.textContent = 'Extracting legal text…';

  try {
    const tab = await getActiveTab();
    if (!tab) throw new Error('NO_ACTIVE_TAB');

    // Scrape
    const scrapeData = await scrapeTab(tab.id);
    lastScrapeData = scrapeData;

    const { confidence, text, hasCookieBanner } = scrapeData;

    // If low confidence and not forced, show not-found
    if (confidence < 24 && !forceAnalyze) {
      showView('notFound');
      return;
    }

    if (!text || text.length < 100) {
      if (!forceAnalyze) { showView('notFound'); return; }
    }

    loadingSubText.textContent = 'Sending to Groq AI…';

    const result = await analyzeText(text || 'No legal text detected on this page.', hasCookieBanner);
    await chrome.storage.session.set({
      termlensTargetTabId: tab.id,
      termlensTargetUrl: tab.url || ''
    });
    renderResults(result);

  } catch (err) {
    errorMessage.textContent = friendlyError(err.message);
    showView('error');
  }
}

// ── Button Event Listeners ────────────────────────────────────────────────
$('btn-analyze').addEventListener('click', () => runAnalysis(false));
$('btn-retry').addEventListener('click', () => runAnalysis(true));
$('btn-error-retry').addEventListener('click', () => runAnalysis(false));
$('btn-reanalyze').addEventListener('click', () => runAnalysis(false));
$('btn-open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────────────────
showView('idle');
