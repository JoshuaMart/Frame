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

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function captureVisible(tab) {
  let injected = false;
  try {
    await injectScrollbarHider(tab.id);
    injected = true;
    // Allow layout to settle after hiding scrollbars.
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

async function captureFull(tab) {
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/scroll-capture.js'],
  });

  try {
    const [init] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__frameScrollCapture.start(),
    });
    const plan = init?.result;
    if (!plan?.steps?.length) {
      throw new Error('Unable to prepare page for capture.');
    }

    const { dpr, viewportWidth, totalHeight, steps } = plan;
    const width = Math.round(viewportWidth * dpr);
    const height = Math.round(totalHeight * dpr);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (y) => window.__frameScrollCapture.scrollTo(y),
        args: [step.scrollY],
      });
      // Allow layout and lazy images to settle; space out successive captures.
      await new Promise((resolve) => setTimeout(resolve, i === 0 ? 350 : 600));
      const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
      try {
        const destY = Math.round(step.y * dpr);
        const cropTop = Math.round(step.cropTop * dpr);
        const drawHeight = Math.min(bmp.height - cropTop, height - destY);
        ctx.drawImage(bmp, 0, cropTop, bmp.width, drawHeight, 0, destY, bmp.width, drawHeight);
      } finally {
        bmp.close();
      }
    }

    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      width,
      height,
      sourceUrl: tab.url,
      sourceTitle: tab.title,
    };
  } finally {
    // Navigation may have removed the content script while capturing.
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__frameScrollCapture?.finish(),
      });
    } catch {}
  }
}

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
  if (!tab) throw new Error('No active tab.');
  if (/^(about:|moz-extension:|chrome:|resource:)/.test(tab.url || '')) {
    throw new Error("This page cannot be captured (internal browser page).");
  }
  const result = mode === 'full' ? await captureFull(tab) : await captureVisible(tab);
  await openEditor(result);
}
