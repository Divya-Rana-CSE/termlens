/**
 * TermLens – content.js
 * Injected into every page. Runs the scraper and caches results in chrome.storage.session.
 * Responds to messages from popup.js and background.js.
 */

function termlensNormalizeWs(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/**
 * Finds a block whose visible text contains the quote; scrolls and flashes an outline.
 */
function termlensScrollToEvidence(quote) {
  const raw = String(quote || '').trim();
  if (raw.length < 8) return { ok: false, error: 'SHORT' };

  let needle = termlensNormalizeWs(raw);
  let el = termlensFindElementForNeedle(needle);

  if (!el && needle.length > 90) {
    el = termlensFindElementForNeedle(needle.slice(0, 90));
  }
  if (!el) {
    for (let len = Math.min(needle.length, 140); len >= 24; len -= 12) {
      el = termlensFindElementForNeedle(needle.slice(0, len));
      if (el) break;
    }
  }

  if (!el) return { ok: false, error: 'NOT_FOUND' };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  termlensFlashElement(el);
  return { ok: true };
}

function termlensFindElementForNeedle(needle) {
  if (!needle || needle.length < 8) return null;

  const prefer =
    'main p, main li, article p, article li, [role="main"] p, [role="main"] li, ' +
    '.terms p, .privacy p, .legal p, #content p, .policy p, body p, body li, td, th';

  for (const el of document.querySelectorAll(prefer)) {
    const t = termlensNormalizeWs(el.innerText);
    if (t.includes(needle)) return el;
  }

  for (const el of document.querySelectorAll('div, section, aside, span')) {
    const t = termlensNormalizeWs(el.innerText);
    if (t.length > needle.length && t.length < needle.length + 1200 && t.includes(needle)) {
      return el;
    }
  }

  return null;
}

function termlensFlashElement(el) {
  if (!el || !el.style) return;
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  const prevTransition = el.style.transition;
  el.style.transition = 'outline 0.2s ease, outline-offset 0.2s ease';
  el.style.outline = '3px solid #06B6D4';
  el.style.outlineOffset = '3px';
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
    el.style.transition = prevTransition;
    window.setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 400);
  }, 2400);
}

// Run the scrape on page load and cache the result
(function initScrape() {
  try {
    const result = TermLensScraper.analyze();
    // Store per-tab cache keyed by URL
    const cacheKey = `termlens_${location.href}`;
    chrome.storage.session.set({ [cacheKey]: result });
  } catch (err) {
    console.warn('[TermLens] Scrape failed on load:', err);
  }
})();

// Listen for on-demand scrape requests from popup or background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TERMLENS_SCRAPE') {
    try {
      const result = TermLensScraper.analyze();
      sendResponse({ ok: true, data: result });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true; // keep channel open for async
  }

  if (message.type === 'TERMLENS_SCROLL_TO') {
    const result = termlensScrollToEvidence(message.quote);
    sendResponse(result);
  }
});
