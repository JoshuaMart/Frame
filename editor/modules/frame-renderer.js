// Renders polished browser chrome (URL bar, tab strip, window controls)
// as a Konva.Group sized to `width`. Each renderer returns { node, height }.

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// ----- shared helpers --------------------------------------------------------

function trafficLights({ x = 16, y = 18 }) {
  const g = new Konva.Group({ listening: false });
  const colors = ['#ec6a5e', '#f5bf4f', '#61c554'];
  colors.forEach((c, i) => {
    g.add(new Konva.Circle({ x: x + i * 18, y, radius: 6, fill: c }));
    // Subtle inner highlight for depth
    g.add(new Konva.Circle({
      x: x + i * 18, y: y - 1.5,
      radius: 2,
      fill: 'rgba(255,255,255,0.35)',
    }));
  });
  return g;
}

function windowsControls({ x, y, color }) {
  const g = new Konva.Group({ listening: false });
  // minimize
  g.add(new Konva.Line({
    points: [x, y + 4, x + 12, y + 4],
    stroke: color, strokeWidth: 1.2,
  }));
  // maximize (square)
  g.add(new Konva.Rect({
    x: x + 24, y: y - 5,
    width: 10, height: 10,
    stroke: color, strokeWidth: 1.2,
  }));
  // close
  g.add(new Konva.Line({
    points: [x + 48, y - 5, x + 58, y + 5],
    stroke: color, strokeWidth: 1.2,
  }));
  g.add(new Konva.Line({
    points: [x + 58, y - 5, x + 48, y + 5],
    stroke: color, strokeWidth: 1.2,
  }));
  return g;
}

// Lucide-style icons. Path data is taken from lucide.dev — each icon is
// designed in a 24x24 viewBox with a 2px stroke. We render via Konva.Path
// and uniformly scale to the target visual size.
const LUCIDE = {
  back:    'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  refresh: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
  home:    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
  lock:    'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  plus:    'M5 12h14M12 5v14',
  close:   'M18 6L6 18M6 6l12 12',
  share:   'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  sidebar: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18',
  tabs:    'M8 8h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
};

const ICON_DEFAULT_SIZE = 20;

function icon(type, cx, cy, color, opts = {}) {
  // 3-dot menu — circles look crisper than a path at small sizes.
  if (type === 'menu-3-dot' || type === 'menu') {
    const g = new Konva.Group({ opacity: opts.opacity ?? 1, listening: false });
    for (let i = -1; i <= 1; i++) {
      g.add(new Konva.Circle({
        x: cx, y: cy + i * 4.5,
        radius: 1.6,
        fill: color,
      }));
    }
    return g;
  }

  const lucideName = type === 'close-x' ? 'close' : type;
  const pathData = LUCIDE[lucideName];
  if (!pathData) return new Konva.Group({ listening: false });

  const size = opts.size ?? ICON_DEFAULT_SIZE;
  const k = size / 24;
  // Lucide is designed with strokeWidth=2 at 24x24. Konva scales the stroke
  // with the transform, so 2 * k gives the visual stroke width.
  // We compensate slightly to keep a 1.7px visible stroke regardless of size.
  const visibleStroke = opts.strokeWidth ?? 1.7;
  return new Konva.Path({
    x: cx - size / 2,
    y: cy - size / 2,
    scaleX: k,
    scaleY: k,
    data: pathData,
    stroke: color,
    strokeWidth: visibleStroke / k,
    lineCap: 'round',
    lineJoin: 'round',
    fill: null,
    opacity: opts.opacity ?? 1,
    listening: false,
  });
}

function tab({ x, y, width, height, palette, title, withClose = true }) {
  const g = new Konva.Group({ x, y });
  g.add(new Konva.Rect({
    x: 0, y: 0,
    width, height,
    fill: palette.tabBg,
    cornerRadius: [10, 10, 0, 0],
  }));
  // Favicon
  g.add(new Konva.Circle({
    x: 18, y: height / 2,
    radius: 6,
    fill: palette.faviconBg,
  }));
  // Title
  g.add(new Konva.Text({
    x: 32, y: height / 2 - 7,
    width: width - (withClose ? 60 : 44),
    height: 14,
    text: title || 'Onglet',
    fontSize: 12,
    fontFamily: SYSTEM_FONT,
    fill: palette.tabFg,
    ellipsis: true,
    wrap: 'none',
  }));
  if (withClose) {
    g.add(icon('close-x', width - 16, height / 2, palette.iconColor, { opacity: 0.6, size: 14 }));
  }
  return g;
}

function urlPill({ x, y, width, height, palette, url, showLock = true }) {
  const g = new Konva.Group({ x, y });
  g.add(new Konva.Rect({
    x: 0, y: 0,
    width, height,
    fill: palette.urlBarBg,
    stroke: palette.urlBarBorder,
    strokeWidth: 1,
    cornerRadius: height / 2,
  }));
  const padLeft = showLock ? 26 : 14;
  if (showLock) {
    g.add(icon('lock', 14, height / 2, palette.iconColor, { opacity: 0.75, size: 13 }));
  }
  g.add(new Konva.Text({
    x: padLeft, y: height / 2 - 7,
    width: width - padLeft - 12,
    height: 14,
    text: url || '',
    fontSize: 12.5,
    fontFamily: SYSTEM_FONT,
    fill: palette.urlBarFg,
    ellipsis: true,
    wrap: 'none',
  }));
  return g;
}

// ----- palettes --------------------------------------------------------------

function paletteFor(kind, theme) {
  const dark = theme === 'dark';
  const base = dark ? {
    tabStripBg: '#202124',
    urlRowBg: '#35363a',
    tabBg: '#35363a',
    tabFg: '#e8eaed',
    urlBarBg: '#1f1f1f',
    urlBarBorder: 'rgba(255,255,255,0.04)',
    urlBarFg: '#e8eaed',
    iconColor: '#9aa0a6',
    faviconBg: '#5f6368',
    bottomBorder: 'rgba(0,0,0,0.4)',
    placeholderFg: 'rgba(232,234,237,0.55)',
  } : {
    tabStripBg: '#dee1e6',
    urlRowBg: '#f1f3f4',
    tabBg: '#ffffff',
    tabFg: '#3c4043',
    urlBarBg: '#ffffff',
    urlBarBorder: 'rgba(0,0,0,0.06)',
    urlBarFg: '#3c4043',
    iconColor: '#5f6368',
    faviconBg: '#dadce0',
    bottomBorder: 'rgba(0,0,0,0.08)',
    placeholderFg: 'rgba(60,64,67,0.5)',
  };

  if (kind === 'safari') {
    return {
      ...base,
      tabStripBg: dark ? '#2c2c2e' : '#f6f6f6',
      urlRowBg: dark ? '#2c2c2e' : '#f6f6f6',
      urlBarBg: dark ? '#1c1c1e' : '#ffffff',
      tabBg: dark ? '#1c1c1e' : '#ffffff',
    };
  }
  if (kind === 'firefox') {
    return {
      ...base,
      tabStripBg: dark ? '#1c1b22' : '#f9f9fb',
      urlRowBg: dark ? '#42414d' : '#ffffff',
      urlBarBg: dark ? '#1c1b22' : '#f6f6f8',
      urlBarBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      tabBg: dark ? '#42414d' : '#ffffff',
    };
  }
  return base; // chrome
}

// ----- per-browser renderers -------------------------------------------------

function renderChrome({ width, theme, url, title }) {
  const p = paletteFor('chrome', theme);
  const TAB_ROW = 36;
  const URL_ROW = 44;
  const height = TAB_ROW + URL_ROW;

  const group = new Konva.Group();

  // Tab strip
  group.add(new Konva.Rect({ x: 0, y: 0, width, height: TAB_ROW, fill: p.tabStripBg }));
  group.add(trafficLights({ x: 16, y: TAB_ROW / 2 }));

  const tabX = 88;
  const tabWidth = Math.min(280, Math.max(140, width - tabX - 60));
  group.add(tab({ x: tabX, y: 6, width: tabWidth, height: TAB_ROW - 6, palette: p, title }));

  // "+" new tab
  group.add(icon('plus', tabX + tabWidth + 18, TAB_ROW / 2, p.iconColor, { opacity: 0.7, size: 16 }));

  // URL bar row
  group.add(new Konva.Rect({ x: 0, y: TAB_ROW, width, height: URL_ROW, fill: p.urlRowBg }));

  const urlRowMid = TAB_ROW + URL_ROW / 2;
  // Nav buttons left
  group.add(icon('back', 24, urlRowMid, p.iconColor, { size: 20 }));
  group.add(icon('forward', 50, urlRowMid, p.iconColor, { opacity: 0.4, size: 20 }));
  group.add(icon('refresh', 76, urlRowMid, p.iconColor, { size: 18 }));

  // URL bar
  const barX = 96;
  const rightCluster = 64; // space for profile + menu
  const barWidth = Math.max(120, width - barX - rightCluster);
  const barHeight = 28;
  group.add(urlPill({
    x: barX,
    y: urlRowMid - barHeight / 2,
    width: barWidth,
    height: barHeight,
    palette: p,
    url,
  }));

  // Profile circle + menu
  group.add(new Konva.Circle({
    x: width - 50, y: urlRowMid,
    radius: 9,
    fill: theme === 'dark' ? '#8ab4f8' : '#1a73e8',
    opacity: 0.85,
  }));
  group.add(icon('menu-3-dot', width - 22, urlRowMid, p.iconColor));

  // Bottom hairline
  group.add(new Konva.Line({
    points: [0, height - 0.5, width, height - 0.5],
    stroke: p.bottomBorder, strokeWidth: 1,
    listening: false,
  }));

  return { node: group, height };
}

function renderSafari({ width, theme, url, title }) {
  const p = paletteFor('safari', theme);
  const HEIGHT = 52;

  const group = new Konva.Group();
  group.add(new Konva.Rect({ x: 0, y: 0, width, height: HEIGHT, fill: p.tabStripBg }));
  group.add(trafficLights({ x: 16, y: HEIGHT / 2 }));

  const mid = HEIGHT / 2;
  // Sidebar + nav
  group.add(icon('sidebar', 92, mid, p.iconColor, { size: 18 }));
  group.add(icon('back', 118, mid, p.iconColor, { size: 20 }));
  group.add(icon('forward', 144, mid, p.iconColor, { opacity: 0.4, size: 20 }));

  // URL bar — Safari has a fairly wide centered pill
  const sideClusterLeft = 168;
  const sideClusterRight = 80;
  const barWidth = Math.max(140, width - sideClusterLeft - sideClusterRight);
  const barHeight = 28;
  // Optional tab title above the URL — for compactness, just show URL.
  group.add(urlPill({
    x: sideClusterLeft,
    y: mid - barHeight / 2,
    width: barWidth,
    height: barHeight,
    palette: p,
    url: url || title || '',
  }));

  // Right cluster: share + tabs
  group.add(icon('share', width - 58, mid, p.iconColor, { size: 18 }));
  group.add(icon('tabs', width - 28, mid, p.iconColor, { size: 18 }));

  group.add(new Konva.Line({
    points: [0, HEIGHT - 0.5, width, HEIGHT - 0.5],
    stroke: p.bottomBorder, strokeWidth: 1,
    listening: false,
  }));

  return { node: group, height: HEIGHT };
}

function renderFirefox({ width, theme, url, title }) {
  const p = paletteFor('firefox', theme);
  const TAB_ROW = 36;
  const URL_ROW = 44;
  const height = TAB_ROW + URL_ROW;

  const group = new Konva.Group();

  // Tab strip
  group.add(new Konva.Rect({ x: 0, y: 0, width, height: TAB_ROW, fill: p.tabStripBg }));
  group.add(trafficLights({ x: 16, y: TAB_ROW / 2 }));

  const tabX = 88;
  const tabWidth = Math.min(260, Math.max(140, width - tabX - 80));
  // Firefox tabs are floating with rounded everything
  const tabH = TAB_ROW - 8;
  const tabY = (TAB_ROW - tabH) / 2;
  const tabGroup = new Konva.Group({ x: tabX, y: tabY });
  tabGroup.add(new Konva.Rect({
    x: 0, y: 0,
    width: tabWidth, height: tabH,
    fill: p.tabBg,
    cornerRadius: 6,
  }));
  tabGroup.add(new Konva.Circle({
    x: 16, y: tabH / 2, radius: 6,
    fill: p.faviconBg,
  }));
  tabGroup.add(new Konva.Text({
    x: 30, y: tabH / 2 - 7,
    width: tabWidth - 50, height: 14,
    text: title || 'Onglet',
    fontSize: 12,
    fontFamily: SYSTEM_FONT,
    fill: p.tabFg,
    ellipsis: true, wrap: 'none',
  }));
  tabGroup.add(icon('close-x', tabWidth - 14, tabH / 2, p.iconColor, { opacity: 0.6, size: 14 }));
  group.add(tabGroup);

  group.add(icon('plus', tabX + tabWidth + 18, TAB_ROW / 2, p.iconColor, { opacity: 0.7, size: 16 }));

  // URL bar row
  group.add(new Konva.Rect({ x: 0, y: TAB_ROW, width, height: URL_ROW, fill: p.urlRowBg }));

  const urlRowMid = TAB_ROW + URL_ROW / 2;
  group.add(icon('back', 24, urlRowMid, p.iconColor, { size: 20 }));
  group.add(icon('forward', 50, urlRowMid, p.iconColor, { opacity: 0.4, size: 20 }));
  group.add(icon('refresh', 76, urlRowMid, p.iconColor, { size: 18 }));
  group.add(icon('home', 102, urlRowMid, p.iconColor, { size: 18 }));

  const barX = 126;
  const rightCluster = 64;
  const barWidth = Math.max(120, width - barX - rightCluster);
  const barHeight = 28;
  group.add(urlPill({
    x: barX,
    y: urlRowMid - barHeight / 2,
    width: barWidth,
    height: barHeight,
    palette: p,
    url,
  }));

  group.add(icon('share', width - 50, urlRowMid, p.iconColor, { size: 18 }));
  group.add(icon('menu-3-dot', width - 22, urlRowMid, p.iconColor));

  group.add(new Konva.Line({
    points: [0, height - 0.5, width, height - 0.5],
    stroke: p.bottomBorder, strokeWidth: 1,
    listening: false,
  }));

  return { node: group, height };
}

const RENDERERS = {
  chrome: renderChrome,
  safari: renderSafari,
  firefox: renderFirefox,
};

// All internal layout numbers (heights, font sizes, icon offsets) are calibrated
// for a 1280px-wide chrome. For wider screenshots (HiDPI captures often produce
// 2560+ px), we render at the reference width and uniformly scale the resulting
// group so the chrome stays visually proportional to the page.
const REF_WIDTH = 1280;

export function renderFrame({ kind, width, theme, url, title }) {
  if (kind === 'none' || !kind) return { node: null, height: 0 };
  const fn = RENDERERS[kind] || renderChrome;
  const scale = width / REF_WIDTH;
  const { node, height } = fn({ width: REF_WIDTH, theme, url, title });
  node.scale({ x: scale, y: scale });
  return { node, height: height * scale };
}
