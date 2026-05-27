import { getCapture } from './modules/storage.js';
import { CanvasEngine } from './modules/canvas-engine.js';
import { renderFrame } from './modules/frame-renderer.js';
import { BlurTool } from './modules/blur-tool.js';
import {
  downloadImage,
  copyToClipboard,
  uploadToImgur,
} from './modules/exporter.js';

const $ = (id) => document.getElementById(id);

// ----- Background presets ----------------------------------------------------

const BG_PRESETS = [
  { id: 'slate',  kind: 'gradient', from: '#1e293b', to: '#0b0f19' },
  { id: 'violet', kind: 'gradient', from: '#a78bfa', to: '#6d28d9' },
  { id: 'peach',  kind: 'gradient', from: '#fb923c', to: '#ef4444' },
  { id: 'teal',   kind: 'gradient', from: '#34d399', to: '#06b6d4' },
  { id: 'white',  kind: 'solid',    color: '#ffffff' },
  { id: 'black',  kind: 'solid',    color: '#000000' },
  { id: 'gray',   kind: 'solid',    color: '#f1f5f9' },
  { id: 'transparent', kind: 'transparent' },
];

const FORMAT_INFO = {
  png:  { mime: 'image/png',  ext: 'png',  label: 'PNG' },
  jpg:  { mime: 'image/jpeg', ext: 'jpg',  label: 'JPG' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
};

// ----- State -----------------------------------------------------------------

const state = {
  engine: null,
  blurTool: null,
  frameKind: 'none',
  frameUrl: '',
  frameTitle: '',
  frameTheme: 'light',
  framePadding: 56,
  frameRadius: 12,
  frameShadow: 24,
  bgPreset: 'violet',
  currentTool: 'select',
  selectedRedaction: null,
  exportFormat: 'png',
};

// ----- Status helpers --------------------------------------------------------

function setStatus(text, isError = false) {
  const el = $('sb-status');
  el.textContent = text || 'Prêt';
  el.classList.toggle('error', !!isError);
  if (text) clearTimeout(setStatus._t);
  if (text && !isError) {
    setStatus._t = setTimeout(() => { el.textContent = 'Prêt'; }, 3000);
  }
}

function updateStatusDims() {
  const dims = `${state.engine.contentWidth} × ${state.engine.contentHeight} px`;
  $('sb-dims').textContent = dims;
}

function updateStatusFrame() {
  const labels = { none: 'Aucun', chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox' };
  const themes = { light: 'Clair', dark: 'Sombre', auto: 'Auto' };
  const f = labels[state.frameKind] || state.frameKind;
  const t = state.frameKind === 'none' ? '' : ' · ' + (themes[state.frameTheme] || state.frameTheme);
  $('sb-frame').textContent = f + t;
}

function updateStatusLayers() {
  const blur = state.blurTool ? state.blurTool.nodes.length : 0;
  const total = 1 + blur + (state.frameKind === 'none' ? 0 : 1);
  $('sb-layers').textContent = `${total} calque${total > 1 ? 's' : ''}`;
}

// ----- Init ------------------------------------------------------------------

function getIdFromUrl() {
  return new URLSearchParams(location.search).get('id');
}

function deriveTitle(rawTitle, url) {
  if (rawTitle && rawTitle.trim()) {
    const cleaned = rawTitle.replace(/\s*[\|\-–·]\s*Mozilla Firefox\s*$/i, '');
    return cleaned.trim();
  }
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Capture'; }
}

function deriveSite(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

async function init() {
  const id = getIdFromUrl();
  if (!id) return showFatal("Aucun identifiant de capture dans l'URL.");

  let record;
  try { record = await getCapture(id); }
  catch (e) { return showFatal(`Erreur d'accès au stockage: ${e.message || e}`); }
  if (!record) return showFatal('Capture introuvable (peut-être expirée).');

  const host = $('canvas-host');
  state.engine = new CanvasEngine({ host });
  await state.engine.loadScreenshotFromBlob(record.blob);

  state.frameUrl = record.sourceUrl || '';
  state.frameTitle = deriveTitle(record.sourceTitle, record.sourceUrl);

  $('frame-url').value = state.frameUrl;
  $('frame-title').value = state.frameTitle;

  // Breadcrumb
  const site = deriveSite(record.sourceUrl);
  $('bc-title').textContent = state.frameTitle
    ? (site ? `${site} · ${state.frameTitle}` : state.frameTitle)
    : 'Capture';

  // Build background presets UI and apply the default
  renderBgPresets();
  state.engine.setPadding(state.framePadding);
  state.engine.setRadius(state.frameRadius);
  state.engine.setShadow(state.frameShadow);
  setBackgroundPreset(state.bgPreset, true);

  $('canvas-placeholder').hidden = true;

  // UI wiring
  bindFramePicker();
  bindFrameSettings();
  bindTools();
  bindZoom();
  bindExports();
  bindKeyboard();

  applyFrame();
  updateStatusDims();
  updateStatusFrame();
  updateStatusLayers();
  updateZoomLabel();
}

function showFatal(msg) {
  const p = $('canvas-placeholder');
  p.textContent = msg;
  p.style.color = 'var(--danger)';
}

// ----- Frame -----------------------------------------------------------------

function bindFramePicker() {
  $('frame-options').addEventListener('click', (e) => {
    const btn = e.target.closest('button.frame-thumb');
    if (!btn) return;
    document.querySelectorAll('.frame-thumb').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.frameKind = btn.dataset.frame;
    $('frame-settings').hidden = state.frameKind === 'none';
    applyFrame();
    updateStatusDims();
    updateStatusFrame();
    updateStatusLayers();
  });
}

function bindFrameSettings() {
  $('frame-url').addEventListener('input', (e) => {
    state.frameUrl = e.target.value;
    applyFrame();
  });
  $('frame-title').addEventListener('input', (e) => {
    state.frameTitle = e.target.value;
    applyFrame();
  });
  $('frame-theme-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme]');
    if (!btn) return;
    $('frame-theme-seg').querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.frameTheme = btn.dataset.theme;
    applyFrame();
    updateStatusFrame();
  });
  $('frame-shadow').addEventListener('input', (e) => {
    state.frameShadow = parseInt(e.target.value, 10) || 0;
    $('shadow-value').textContent = `${state.frameShadow}`;
    state.engine.setShadow(state.frameShadow);
  });
  $('frame-padding').addEventListener('input', (e) => {
    state.framePadding = parseInt(e.target.value, 10) || 0;
    $('padding-value').textContent = `${state.framePadding} px`;
    state.engine.setPadding(state.framePadding);
    updateStatusDims();
  });
  $('frame-radius').addEventListener('input', (e) => {
    state.frameRadius = parseInt(e.target.value, 10) || 0;
    $('radius-value').textContent = `${state.frameRadius} px`;
    state.engine.setRadius(state.frameRadius);
  });
}

function resolveTheme(t) {
  if (t === 'auto') {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    catch { return 'light'; }
  }
  return t;
}

function applyFrame() {
  const { node, height } = renderFrame({
    kind: state.frameKind,
    width: state.engine.screenshotWidth,
    theme: resolveTheme(state.frameTheme),
    url: state.frameUrl,
    title: state.frameTitle,
  });
  state.engine.setChrome(node, height);
}

// ----- Background presets ----------------------------------------------------

function renderBgPresets() {
  const host = $('bg-presets');
  host.innerHTML = '';
  for (const p of BG_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bg-swatch';
    btn.dataset.preset = p.id;
    btn.dataset.kind = p.kind;
    btn.title = p.id;

    const fill = document.createElement('span');
    fill.className = 'fill';
    if (p.kind === 'gradient') {
      fill.style.background = `linear-gradient(135deg, ${p.from}, ${p.to})`;
    } else if (p.kind === 'solid') {
      fill.style.background = p.color;
    }
    // transparent: handled by CSS

    btn.appendChild(fill);
    btn.addEventListener('click', () => setBackgroundPreset(p.id, true));
    host.appendChild(btn);
  }
}

function setBackgroundPreset(id, apply = true) {
  state.bgPreset = id;
  document.querySelectorAll('.bg-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.preset === id);
  });
  if (!apply || !state.engine) return;
  const preset = BG_PRESETS.find((p) => p.id === id) || BG_PRESETS[0];
  if (preset.kind === 'gradient') {
    state.engine.setBackground({ type: 'gradient', from: preset.from, to: preset.to });
  } else if (preset.kind === 'transparent') {
    state.engine.setBackground({ type: 'transparent' });
  } else {
    state.engine.setBackground({ type: 'solid', color: preset.color });
  }
}

// ----- Tools -----------------------------------------------------------------

function bindTools() {
  state.blurTool = new BlurTool({
    engine: state.engine,
    onSelectionChange: (node) => {
      state.selectedRedaction = node;
      renderMaskPanelForSelection();
      updateStatusLayers();
    },
  });

  document.querySelectorAll('.tool-tab').forEach((btn) => {
    if (btn.classList.contains('disabled')) return;
    btn.addEventListener('click', () => activateTool(btn.dataset.tool));
  });

  // Mask styles toolbar (for "next" or selected)
  $('mask-styles').addEventListener('click', (e) => {
    const btn = e.target.closest('.mask-style');
    if (!btn) return;
    const style = btn.dataset.style;
    if (state.selectedRedaction) {
      const fresh = state.blurTool.setStyle(state.selectedRedaction, style);
      state.selectedRedaction = fresh;
      renderMaskPanelForSelection();
    } else {
      state.blurTool.setStyleForNew(style);
      $('mask-styles').querySelectorAll('.mask-style').forEach((b) => {
        b.classList.toggle('active', b.dataset.style === style);
      });
      updateMaskHint(style);
    }
  });

  // Intensity slider
  $('mask-intensity').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('mask-intensity-value').textContent = `${v} px`;
    if (state.selectedRedaction) {
      state.blurTool.setStrength(state.selectedRedaction, v);
    }
  });

  $('delete-redaction').addEventListener('click', () => {
    state.blurTool.deleteSelected();
    updateStatusLayers();
  });

  // Initialize mask hint
  updateMaskHint(state.blurTool.currentStyle);
}

function activateTool(name) {
  state.currentTool = name;
  document.querySelectorAll('.tool-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === name);
  });
  state.blurTool.setActive(name === 'blur');
  $('mask-section').hidden = (name !== 'blur');
  if (name !== 'blur') state.blurTool.deselect();
}

const STYLE_HINTS = {
  blur: "Esthétique mais partiellement réversible. Évite-le pour des données sensibles.",
  pixelate: "Mosaïque uniforme. Bonne robustesse pour la plupart des cas.",
  mask: "Rectangle plein. Irréversible — recommandé pour mots de passe et tokens.",
};

function updateMaskHint(style) {
  $('mask-hint').textContent = STYLE_HINTS[style] || '';
}

function renderMaskPanelForSelection() {
  const node = state.selectedRedaction;
  const styles = $('mask-styles');
  const intensityField = $('mask-intensity').parentElement;
  const intensitySlider = $('mask-intensity');
  const intensityLabel = $('mask-intensity-value');
  const actionsField = $('mask-actions-field');

  if (node) {
    // Reflect selected node's style + strength
    const style = node._frameStyle;
    styles.querySelectorAll('.mask-style').forEach((b) => {
      b.classList.toggle('active', b.dataset.style === style);
    });
    if (style === 'mask') {
      intensityField.hidden = true;
    } else {
      intensityField.hidden = false;
      intensitySlider.value = node._frameStrength;
      intensityLabel.textContent = `${node._frameStrength} px`;
    }
    actionsField.hidden = false;
    updateMaskHint(style);
  } else {
    // Show "next style" indicator
    const style = state.blurTool.currentStyle;
    styles.querySelectorAll('.mask-style').forEach((b) => {
      b.classList.toggle('active', b.dataset.style === style);
    });
    intensityField.hidden = false;
    actionsField.hidden = true;
    updateMaskHint(style);
  }
}

// ----- Zoom ------------------------------------------------------------------

function bindZoom() {
  $('zoom-in').addEventListener('click', () => updateZoom(state.engine.getZoom() * 1.2));
  $('zoom-out').addEventListener('click', () => updateZoom(state.engine.getZoom() / 1.2));
  $('zoom-fit').addEventListener('click', () => { state.engine.fitToHost(); updateZoomLabel(); });
  state.engine.stage.on('wheel', (e) => {
    if (!e.evt.ctrlKey && !e.evt.metaKey) return;
    e.evt.preventDefault();
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    updateZoom(state.engine.getZoom() * factor);
  });
  // Update label when fit changes (e.g. on resize)
  const obs = new ResizeObserver(() => updateZoomLabel());
  obs.observe(document.querySelector('.canvas-area'));
}

function updateZoom(z) {
  state.engine.setZoom(z);
  updateZoomLabel();
}

function updateZoomLabel() {
  if (!state.engine) return;
  $('zoom-label').textContent = `${Math.round(state.engine.getZoom() * 100)}%`;
}

// ----- Exports ---------------------------------------------------------------

function bindExports() {
  // Format selector
  $('format-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn');
    if (!btn) return;
    document.querySelectorAll('.format-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.exportFormat = btn.dataset.format;
  });

  // Primary download (sidebar + topbar)
  $('export-download').addEventListener('click', () => doDownload());
  $('export-primary').addEventListener('click', () => doDownload());

  $('export-clipboard').addEventListener('click', () => withBusy('export-clipboard', async () => {
    await copyToClipboard(state.engine);
    setStatus('Copié dans le presse-papiers.');
  }));

  $('export-share').addEventListener('click', () => withBusy('export-share', async () => {
    setStatus('Upload sur Imgur…');
    const url = await uploadToImgur(state.engine);
    const out = $('export-result');
    out.hidden = false;
    out.innerHTML = `<b>URL :</b> <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    try { await navigator.clipboard.writeText(url); setStatus('URL copiée.'); }
    catch { setStatus('Upload OK.'); }
  }));
}

async function doDownload() {
  const fmt = FORMAT_INFO[state.exportFormat] || FORMAT_INFO.png;
  await withBusy('export-download', async () => {
    await downloadImage(state.engine, fmt.mime, fmt.ext);
    setStatus(`${fmt.label} téléchargé.`);
  });
}

async function withBusy(btnId, fn) {
  const btn = $(btnId);
  if (btn) btn.disabled = true;
  try { await fn(); }
  catch (e) { setStatus(e?.message || String(e), true); }
  finally { if (btn) btn.disabled = false; }
}

// ----- Keyboard --------------------------------------------------------------

function bindKeyboard() {
  const isTyping = () => {
    const el = document.activeElement;
    return el && /input|textarea|select/i.test(el.tagName);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.selectedRedaction) state.blurTool.deselect();
      else activateTool('select');
      return;
    }
    if (isTyping()) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedRedaction) {
      e.preventDefault();
      state.blurTool.deleteSelected();
      updateStatusLayers();
    } else if (e.key === 'b' || e.key === 'B') {
      activateTool('blur');
    } else if (e.key === 'v' || e.key === 'V') {
      activateTool('select');
    }
  });
}

init();
