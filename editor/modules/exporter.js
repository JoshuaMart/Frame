// Exports: PNG/JPG download, clipboard copy, Imgur upload.

const IMGUR_CLIENT_ID = '546c25a59c58ad7'; // Public anonymous client ID often used by open-source tools.

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export async function downloadImage(engine, mime, ext) {
  const blob = await engine.exportToBlob(mime, 0.92);
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({
      url,
      filename: `frame-screenshot-${timestamp()}.${ext}`,
      saveAs: false,
    });
  } finally {
    // Revoke a bit later so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function copyToClipboard(engine) {
  const blob = await engine.exportToBlob('image/png');
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("Clipboard is not available in this context.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type]: blob }),
  ]);
}

export async function uploadToImgur(engine) {
  const blob = await engine.exportToBlob('image/png');
  const form = new FormData();
  form.append('image', blob, 'frame-screenshot.png');
  form.append('type', 'file');

  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` },
    body: form,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.data?.error || '';
    } catch {}
    throw new Error(`Imgur upload failed (${res.status}). ${detail}`);
  }
  const json = await res.json();
  const link = json?.data?.link;
  if (!link) throw new Error('Invalid Imgur response.');
  return link;
}
