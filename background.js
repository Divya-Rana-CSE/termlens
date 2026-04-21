/**
 * TermLens – background.js (Service Worker)
 * Handles Groq API calls and relays analysis results to the popup.
 *
 * 🔑 API key: Extension toolbar → TermLens → ⋮ → Options (or right-click → Options).
 *    Keys come from https://console.groq.com/keys (Groq, not xAI Grok). Format: gsk_…
 *    Optional: set INLINE_GROQ_API_KEY below for a file-only fallback (not recommended).
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────
/** @type {string} Optional fallback; prefer saving the key in extension Options. */
const INLINE_GROQ_API_KEY = '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // Best free production model on Groq
/** Enough headroom for summary + risks + cookies JSON without mid-stream truncation. */
const MAX_TOKENS = 4096;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the Groq API key: chrome.storage (Options page) first, then optional inline fallback.
 */
async function resolveGroqApiKey() {
  const { groqApiKey } = await chrome.storage.local.get('groqApiKey');
  const fromStorage = String(groqApiKey || '').trim();
  if (fromStorage) return fromStorage;
  return String(INLINE_GROQ_API_KEY || '').trim();
}

/**
 * Builds the analysis prompt sent to Llama via Groq.
 */
function buildPrompt(text, hasCookieBanner) {
  return `You are a privacy and legal expert helping everyday users understand Terms & Conditions, Privacy Policies, and Cookie consents.

Analyze the following webpage text and respond ONLY with a valid JSON object in the exact structure below. Do not include any text outside the JSON.

TEXT TO ANALYZE:
---
${text}
---

Respond with this exact JSON structure:
{
  "summary": [
    {
      "point": "YOUR plain-English explanation for a non-lawyer (see rules below)",
      "sourceQuote": "A different string: copy 25–180 characters VERBATIM from the BODY of TEXT TO ANALYZE that backs up your point (not the same wording as point). Use \"\" only if impossible."
    }
  ],
  "risks": [
    {
      "type": "data_sharing | auto_renewal | arbitration | termination | other",
      "label": "Short risk label",
      "detail": "One sentence explanation",
      "severity": "high | medium | low",
      "sourceQuote": "VERBATIM substring from TEXT TO ANALYZE (25–180 chars) showing this risk, or \"\" if none."
    }
  ],
  "cookies": {
    "accept": ["List of cookie categories safe to accept"],
    "reject": ["List of cookie categories to reject"],
    "note": "One sentence cookie recommendation"
  },
  "contentType": "terms | privacy | cookies | mixed | unclear",
  "overallRisk": "high | medium | low"
}

Rules for "summary" (critical):
- You need BOTH: (A) a real mini-explanation in "point", and (B) evidence in "sourceQuote". They must NOT be duplicates.
- "point": Write 1–2 full sentences (about 15–45 words) that EXPLAIN what the policy means in everyday language—what the user should know or what the company can do. Cover substance: rights, obligations, data use, fees, cancellation, cookies, etc. as appropriate.
- FORBIDDEN for "point": Do NOT use "point" as a section title, chapter heading, or short label copied from the document (e.g. avoid alone: "Intellectual Property", "Limitation of Liability", "Cookies"). If you mention a topic, still add what the text actually says about it.
- FORBIDDEN for "point": Do not use only 3–6 word noun phrases that read like a table of contents.
- "sourceQuote": Must be copied EXACTLY from TEXT TO ANALYZE—usually a sentence or clause from the paragraph under a heading, NOT the heading line itself, so clicking can scroll to the proof. Must differ in wording from "point" (point is your paraphrase; sourceQuote is document text).

Good vs bad examples for "point" (illustrative only):
- BAD point: "Data retention"
- GOOD point: "The company may keep your account data for several years after you close your account, and some logs can be stored longer for legal or security reasons."
- BAD point: "Cookies and tracking"
- GOOD point: "The site uses cookies for essential functions, analytics, and sometimes ads, and you may be able to turn off non-essential types in their settings."

Other rules:
- summary: 3-5 objects; each must follow the summary rules above; sourceQuote whenever possible from TEXT TO ANALYZE
- risks: only include risks actually found in the text; empty array [] if none found; each sourceQuote verbatim from TEXT TO ANALYZE when possible
- cookies.accept and cookies.reject: use real category names from the text; if no cookie info found, use []; "cookies.note" should be a helpful plain-English sentence for the user
- Be honest - if content is unclear or unrelated, set contentType to "unclear"
- Return ONLY the raw JSON object, no markdown, no explanation
${hasCookieBanner ? '- A cookie banner was detected on this page — pay special attention to cookie categories.' : ''}`;
}

/**
 * Calls the Groq API (OpenAI-compatible endpoint) with the page text.
 * Returns a parsed JSON result object or throws an error.
 */
async function callGroqAPI(text, hasCookieBanner) {
  const apiKey = await resolveGroqApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2, // Lower = more deterministic JSON output
        messages: [
          {
            role: 'user',
            content: buildPrompt(text, hasCookieBanner)
          }
        ]
      })
    });
  } catch (networkErr) {
    throw new Error('API_NETWORK_ERROR');
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error('API_KEY_INVALID');
    if (response.status === 429) throw new Error('API_RATE_LIMITED');
    if (response.status >= 500) throw new Error('API_SERVER_ERROR');
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json();

  // Groq uses OpenAI-compatible response: choices[0].message.content
  const rawText = data?.choices?.[0]?.message?.content?.trim();
  if (!rawText) throw new Error('API_EMPTY_RESPONSE');

  // Strip markdown code fences if the model wraps the JSON
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('API_PARSE_ERROR');
  }
  return normalizeAnalysisResult(parsed);
}

/**
 * Ensures summary/risk shapes always include point + sourceQuote for the popup.
 */
function normalizeAnalysisResult(data) {
  if (!data || typeof data !== 'object') return data;

  const summaryIn = data.summary;
  if (Array.isArray(summaryIn)) {
    data.summary = summaryIn.map(item => {
      if (typeof item === 'string') {
        return { point: item, sourceQuote: '' };
      }
      const point = item.point || item.text || item.summary || '';
      const sourceQuote = item.sourceQuote || item.quote || item.evidence || '';
      return { point: String(point), sourceQuote: String(sourceQuote || '').trim() };
    });
  }

  if (Array.isArray(data.risks)) {
    data.risks = data.risks.map(r => ({
      ...r,
      sourceQuote: String(r.sourceQuote || r.evidenceQuote || '').trim()
    }));
  }

  return data;
}

/**
 * Message handler — popup sends TERMLENS_ANALYZE, we respond with analysis.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TERMLENS_ANALYZE') {
    const { text, hasCookieBanner } = message;

    callGroqAPI(text, hasCookieBanner)
      .then(result => sendResponse({ ok: true, data: result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true; // keep message channel open for async response
  }
});
