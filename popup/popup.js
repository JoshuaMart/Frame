const statusEl = document.getElementById('status');
const visibleBtn = document.getElementById('capture-visible');
const fullBtn = document.getElementById('capture-full');

function showStatus(text, isError = false) {
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function setBusy(busy) {
  visibleBtn.disabled = busy;
  fullBtn.disabled = busy;
}

async function trigger(type) {
  setBusy(true);
  showStatus(type === 'visible' ? 'Capturing…' : 'Scrolling capture in progress…');
  try {
    const response = await browser.runtime.sendMessage({ type: 'capture', mode: type });
    if (!response?.ok) throw new Error(response?.error || 'Capture failed');
    window.close();
  } catch (err) {
    showStatus(err.message || String(err), true);
    setBusy(false);
  }
}

visibleBtn.addEventListener('click', () => trigger('visible'));
fullBtn.addEventListener('click', () => trigger('full'));
