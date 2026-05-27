# Frame

A Firefox extension to capture, frame and redact web page screenshots — local-first, no data collection.

## Features

- **Capture** the visible viewport or the full scrolling page
- **Browser frames** (Chrome, Safari, Firefox) with editable URL and tab title, light/dark themes
- **Redaction tool** with three modes:
  - *Blur* — esthetic but partially reversible
  - *Mosaic* — pixelation, robust for most cases
  - *Solid* — black rectangle, irreversible (recommended for passwords, tokens)
- **Customizable canvas**: padding, rounded corners, drop shadow, background presets (gradients + solids + transparent)
- **Export** to PNG, JPG or WebP — download, copy to clipboard, or upload to Imgur

## Privacy

Frame does **not** collect, store or transmit any user data. Captures are kept locally in IndexedDB only for the duration of an editing session. The Imgur upload is opt-in — it only happens when you explicitly click *Share*.

## Installation

### From Firefox Add-ons (recommended once published)

Visit the [add-on listing on AMO](https://addons.mozilla.org/) *(link added after publication)* and click **Add to Firefox**.

### From a release ZIP (sideload, temporary)

1. Download `frame-<version>.zip` from the [Releases page](../../releases).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the ZIP (or its `manifest.json` after unzipping).

The extension stays loaded until Firefox is restarted.

## Usage

1. Click the **Frame** icon in the toolbar.
2. Choose **Capture visible area** or **Capture full page**.
3. The editor opens in a new tab:
   - Pick a browser frame from the left panel (or *None* for a raw screenshot).
   - Customize URL, tab title, theme, shadow, background, padding, corner radius.
   - Switch to the **Redact** tool to mask sensitive areas.
   - Export from the right panel.

### Keyboard shortcuts (in the editor)

- `V` — Selection tool
- `B` — Redact tool
- `Esc` — Deselect / back to Selection
- `Delete` / `Backspace` — Delete selected redaction
- `Ctrl/Cmd + scroll` — Zoom

## Build from source

```sh
git clone https://github.com/JoshuaMart/Frame.git
cd Frame
npm install
npm run build         # writes web-ext-artifacts/frame-<version>.zip
```

Other scripts:

```sh
npm run lint          # ESLint + web-ext lint (addons-linter)
npm run run:firefox   # Launch Firefox with the extension loaded
```

## Project layout

```
manifest.json         # MV3 manifest
background/           # Event page — capture orchestration, IndexedDB
content/              # Content script for scrolling capture
popup/                # Toolbar popup
editor/               # Editor page (HTML/CSS/JS)
  modules/            # canvas-engine, frame-renderer, blur-tool, exporter, storage
icons/                # Extension icon
lib/                  # Vendored Konva (canvas library)
```

## Security

Found a vulnerability? Please follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## License

[MIT](./LICENSE) © Joshua Martinelle
