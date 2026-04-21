const input = document.getElementById('api-key');
const btnSave = document.getElementById('btn-save');
const status = document.getElementById('status');
const keyHint = document.getElementById('key-hint');

function setStatus(msg, kind) {
  status.textContent = msg;
  status.classList.remove('ok', 'err');
  if (kind) status.classList.add(kind);
}

document.addEventListener('DOMContentLoaded', async () => {
  const { groqApiKey } = await chrome.storage.local.get('groqApiKey');
  if (groqApiKey && String(groqApiKey).trim()) {
    keyHint.classList.remove('hidden');
  }
});

btnSave.addEventListener('click', async () => {
  const key = input.value.trim();
  await chrome.storage.local.set({ groqApiKey: key });
  input.value = '';
  if (key) {
    keyHint.classList.remove('hidden');
    setStatus('Groq API key saved. You can close this tab and run TermLens again.', 'ok');
  } else {
    keyHint.classList.add('hidden');
    setStatus('API key cleared. Add a new key before analyzing pages.', 'ok');
  }
});
