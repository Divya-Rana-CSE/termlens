/**
 * TermLens – scraper.js
 * Detects and extracts Terms & Conditions / Privacy Policy / Cookie content from the DOM.
 */

const TermLensScraper = (() => {

  // Keywords that strongly indicate legal/T&C content
  const PAGE_SIGNALS = [
    'terms of service', 'terms & conditions', 'terms and conditions',
    'privacy policy', 'cookie policy', 'data processing agreement',
    'end user license', 'eula', 'legal notice', 'disclaimer',
    'user agreement', 'service agreement', 'acceptable use policy',
    'gdpr', 'ccpa', 'data protection', 'cookie consent',
    'refund policy', 'return policy', 'subscription terms'
  ];

  // CSS selectors that commonly wrap legal content
  const CONTENT_SELECTORS = [
    'main', 'article', '[role="main"]',
    '.terms', '.privacy', '.legal', '.policy', '.cookies',
    '#terms', '#privacy', '#legal', '#policy', '#cookies',
    '.terms-of-service', '.privacy-policy', '.cookie-policy',
    '#terms-of-service', '#privacy-policy', '#cookie-policy',
    '.tos', '#tos', '.eula', '#eula',
    '.content', '#content', '.page-content', '#page-content'
  ];

  /**
   * Checks the page title, URL, and h1/h2 tags for T&C signals.
   * Returns a confidence score 0–100.
   */
  function getPageConfidence() {
    const urlStr = (window.location.href + ' ' + document.title).toLowerCase();
    const headings = [...document.querySelectorAll('h1, h2')]
      .map(el => el.textContent.toLowerCase())
      .join(' ');
    const combined = urlStr + ' ' + headings;

    let hits = 0;
    for (const signal of PAGE_SIGNALS) {
      if (combined.includes(signal)) hits++;
    }
    // Also check body text sample for density
    const bodySnippet = document.body?.innerText?.slice(0, 3000).toLowerCase() || '';
    for (const signal of PAGE_SIGNALS) {
      if (bodySnippet.includes(signal)) hits++;
    }

    return Math.min(100, hits * 12);
  }

  /**
   * Extracts the most relevant legal text from the page.
   * Uses targeted selectors first, falls back to body text.
   * Returns null if no meaningful content found.
   */
  function extractText() {
    let text = '';

    // Try targeted selectors first
    for (const sel of CONTENT_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const candidate = el.innerText?.trim();
          if (candidate && candidate.length > 500) {
            text = candidate;
            break;
          }
        }
      } catch (_) {}
    }

    // Fallback: grab the full body text
    if (!text || text.length < 200) {
      text = document.body?.innerText?.trim() || '';
    }

    if (!text || text.length < 100) return null;

    // Trim to ~12,000 chars to keep API costs reasonable (Claude handles long context well)
    return text.slice(0, 12000);
  }

  /**
   * Detects cookie consent banners/modals currently visible on the page.
   */
  function detectCookieBanner() {
    const cookieSelectors = [
      '[id*="cookie"]', '[class*="cookie"]',
      '[id*="consent"]', '[class*="consent"]',
      '[id*="gdpr"]', '[class*="gdpr"]',
      '[id*="banner"]', '[class*="banner"]',
      '[aria-label*="cookie" i]', '[aria-label*="consent" i]'
    ];
    for (const sel of cookieSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return true; // visible
      } catch (_) {}
    }
    return false;
  }

  /**
   * Main export – returns { confidence, text, hasCookieBanner }
   */
  function analyze() {
    const confidence = getPageConfidence();
    const text = extractText();
    const hasCookieBanner = detectCookieBanner();
    return { confidence, text, hasCookieBanner };
  }

  return { analyze };
})();
