# 🔍 TermLens

> **Know what you're agreeing to — before you click Accept.**

TermLens is an AI-powered Chrome Extension that scans Terms & Conditions, Privacy Policies, and Cookie consent pages — and gives you a plain-English breakdown in seconds, complete with a risk score and cookie recommendations.

---

## ✨ Features

- 📄 **Plain-English Summary** — Converts legal jargon into simple, readable bullet points
- 🛡️ **Risk Score** — Low / Medium / High rating based on what the policy actually permits
- 🚩 **Red Flag Detection** — Flags data selling, third-party sharing, auto-renewals, arbitration clauses & more
- 🍪 **Cookie Recommendations** — Tells you which cookies are safe to accept and which to reject
- 💬 **Source Quotes** — Every finding is backed by the exact text from the original policy
- ⚙️ **Secure API Key Storage** — Your Groq API key is stored locally in Chrome, never exposed

---

## 🖼️ Demo

> Open the extension on any Terms & Conditions or Privacy Policy page and click **Analyze**.

![TermLens Demo](docs/demo2.gif)

---

## 🚀 Installation (Local)

Since TermLens is not yet on the Chrome Web Store, follow these steps to install it:

1. **Download or clone this repo**
   ```bash
   git clone https://github.com/Divya-Rana-CSE/termlens.git
   ```

2. **Open Chrome** and go to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in the top-right corner)

4. Click **"Load unpacked"** and select the `TermLens` folder

5. The TermLens icon will appear in your Chrome toolbar

---

## 🔑 Setup — Add Your Groq API Key

TermLens uses the **Groq API** (free) to power its AI analysis.

1. Get a free API key at [console.groq.com/keys](https://console.groq.com/keys)
2. Right-click the TermLens extension icon → **Options**
3. Paste your key (starts with `gsk_`) and click **Save**

> Your key is stored locally in Chrome storage and never sent anywhere except the Groq API.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Extension (Manifest V3) |
| Content Scraping | DOM Scraping via Content Scripts |
| AI Analysis | Groq API — `llama-3.3-70b-versatile` |
| Risk Classification | Prompt-based JSON structured output |
| Storage | `chrome.storage.local` |

---

## 📁 Project Structure

```
TermLens/
├── icons/                  # Extension icons (16, 48, 128px)
├── options/
│   ├── options.html        # API key settings page
│   ├── options.css
│   └── options.js
├── popup/
│   ├── popup.html          # Main extension popup UI
│   ├── popup.css
│   └── popup.js            # Orchestrates scrape → analyze → render
├── utils/
│   └── scraper.js          # DOM text extraction logic
├── background.js           # Service worker — handles Groq API calls
├── content.js              # Injected into pages to extract policy text
└── manifest.json           # Extension configuration (Manifest V3)
```

---

## 🔒 Privacy

- TermLens does **not** collect or store any user data
- Policy text is sent **only** to the Groq API for analysis
- Your API key is stored locally in your browser only
- No analytics, no tracking, no servers of our own

---

## 🏆 Built At

Built for **HackDUCS** — solving the universal problem of unread Terms & Conditions using AI.

---

## 📄 License

MIT License — free to use, modify, and distribute.