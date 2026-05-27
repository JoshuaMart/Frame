// Background event page — orchestrates capture and editor opening.
//
// Message contract (from popup):
//   { type: 'capture', mode: 'visible' | 'full' }
//   -> { ok: true } | { ok: false, error: string }

const DB_NAME = 'frame-screenshot';
const STORE = 'captures';
const DB_VERSION = 1;

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbPut(id, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- capture ----------

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function captureVisible(tab) {
  let injected = false;
  try {
    await injectScrollbarHider(tab.id);
    injected = true;
    // Allow layout to settle (Firefox repaints synchronously most of the time).
    await new Promise((r) => setTimeout(r, 80));
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
    const blob = await dataUrlToBlob(dataUrl);
    const dims = await blobDimensions(blob);
    return {
      blob,
      width: dims.width,
      height: dims.height,
      sourceUrl: tab.url,
      sourceTitle: tab.title,
    };
  } finally {
    if (injected) {
      try { await removeScrollbarHider(tab.id); } catch {}
    }
  }
}

async function injectScrollbarHider(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (document.getElementById('__frame-no-scrollbar')) return;
      const s = document.createElement('style');
      s.id = '__frame-no-scrollbar';
      s.textContent = `
        html { scrollbar-width: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar,
        *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      `;
      document.documentElement.appendChild(s);
    },
  });
}

async function removeScrollbarHider(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const s = document.getElementById('__frame-no-scrollbar');
      if (s) s.remove();
    },
  });
}

async function blobDimensions(blob) {
  const bmp = await createImageBitmap(blob);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close();
  return dims;
}

// Full-page capture: runs scroll-capture script in the tab, captures each
// viewport position, then stitches with OffscreenCanvas.
async function captureFull(tab) {
  // Inject the orchestration content script.
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/scroll-capture.js'],
  });

  // After injection the script has exposed window.__frameScrollCapture.
  const init = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__frameScrollCapture.start(),
  });
  const plan = init[0].result;
  if (!plan || !plan.steps?.length) {
    throw new Error('Impossible de préparer la page pour la capture.');
  }

  const { dpr, viewportWidth, totalHeight, steps } = plan;

  const shots = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y) => window.__frameScrollCapture.scrollTo(y),
      args: [step.scrollY],
    });
    // Wait for layout + lazy images.
    await new Promise((r) => setTimeout(r, 350));
    // Rate-limit: captureVisibleTab is throttled (~MAX_WRITE_OPERATIONS_PER_MINUTE).
    if (i > 0) await new Promise((r) => setTimeout(r, 250));

    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
    shots.push({ dataUrl, y: step.y, cropTop: step.cropTop });
  }

  // Restore the page.
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__frameScrollCapture.finish(),
  });

  // Stitch.
  const totalWidthPx = Math.round(viewportWidth * dpr);
  const totalHeightPx = Math.round(totalHeight * dpr);
  const canvas = new OffscreenCanvas(totalWidthPx, totalHeightPx);
  const ctx = canvas.getContext('2d');

  for (const shot of shots) {
    const blob = await dataUrlToBlob(shot.dataUrl);
    const bmp = await createImageBitmap(blob);
    const destY = Math.round(shot.y * dpr);
    const srcCropTop = Math.round(shot.cropTop * dpr);
    const drawHeight = Math.min(
      bmp.height - srcCropTop,
      totalHeightPx - destY,
    );
    ctx.drawImage(
      bmp,
      0,
      srcCropTop,
      bmp.width,
      drawHeight,
      0,
      destY,
      bmp.width,
      drawHeight,
    );
    bmp.close();
  }

  const stitched = await canvas.convertToBlob({ type: 'image/png' });
  return {
    blob: stitched,
    width: totalWidthPx,
    height: totalHeightPx,
    sourceUrl: tab.url,
    sourceTitle: tab.title,
  };
}

// ---------- editor opening ----------

async function openEditor(captureResult) {
  const id = crypto.randomUUID();
  await dbPut(id, {
    blob: captureResult.blob,
    width: captureResult.width,
    height: captureResult.height,
    sourceUrl: captureResult.sourceUrl || '',
    sourceTitle: captureResult.sourceTitle || '',
    createdAt: Date.now(),
  });
  const url = browser.runtime.getURL(`editor/editor.html?id=${id}`);
  await browser.tabs.create({ url });
  return id;
}

// ---------- message handler ----------

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'capture') {
    return handleCapture(msg.mode).then(
      () => ({ ok: true }),
      (err) => ({ ok: false, error: err?.message || String(err) }),
    );
  }
});

async function handleCapture(mode) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('Aucun onglet actif.');
  if (/^(about:|moz-extension:|chrome:|resource:)/.test(tab.url || '')) {
    throw new Error("Cette page ne peut pas être capturée (page interne du navigateur).");
  }
  const result = mode === 'full' ? await captureFull(tab) : await captureVisible(tab);
  await openEditor(result);
}
