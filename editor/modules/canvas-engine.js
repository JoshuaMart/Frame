const FRAME_RADIUS = 10;

export class CanvasEngine {
  constructor({ host }) {
    this.host = host;
    this.stage = new Konva.Stage({
      container: host,
      width: host.clientWidth,
      height: host.clientHeight,
    });

    this.contentLayer = new Konva.Layer();
    this.annotationLayer = new Konva.Layer();
    this.stage.add(this.contentLayer);
    this.stage.add(this.annotationLayer);

    this.background = new Konva.Rect({
      x: 0, y: 0, width: 0, height: 0,
      fill: '#f1f5f9',
      listening: false,
    });
    this.contentLayer.add(this.background);

    this.shadowPlate = new Konva.Rect({
      x: 0, y: 0, width: 0, height: 0,
      fill: '#ffffff',
      cornerRadius: 0,
      shadowColor: '#0f172a',
      shadowBlur: 40,
      shadowOpacity: 0.22,
      shadowOffsetY: 18,
      visible: false,
      listening: false,
    });
    this.contentLayer.add(this.shadowPlate);

    this.frameGroup = new Konva.Group({ x: 0, y: 0 });
    this.contentLayer.add(this.frameGroup);

    this.chromeGroup = new Konva.Group({ x: 0, y: 0 });
    this.frameGroup.add(this.chromeGroup);

    this.screenshot = null;
    this.screenshotImage = null;
    this.screenshotWidth = 0;
    this.screenshotHeight = 0;

    this.padding = 56;
    this.chromeHeight = 0;
    this.hasFrame = false;
    this.frameRadius = FRAME_RADIUS;
    this.shadowStrength = 24;
    this.transparentBg = false;
    this.bgType = 'solid';
    this.bgColor = '#f1f5f9';
    this.bgFrom = null;
    this.bgTo = null;

    this.zoom = 1;
    this.contentWidth = 0;
    this.contentHeight = 0;

    this._resizeObserver = new ResizeObserver(() => this.fitToHost());
    this._resizeObserver.observe(host);
  }

  async loadScreenshotFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    let img;
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.screenshot = img;
    this.screenshotWidth = img.naturalWidth;
    this.screenshotHeight = img.naturalHeight;

    if (this.screenshotImage) this.screenshotImage.destroy();
    this.screenshotImage = new Konva.Image({
      image: img,
      x: 0, y: 0,
      width: this.screenshotWidth,
      height: this.screenshotHeight,
    });
    this.frameGroup.add(this.screenshotImage);

    this._layout();
    this.fitToHost();
  }

  setChrome(chromeNode, chromeHeight) {
    this.chromeGroup.destroyChildren();
    if (chromeNode) this.chromeGroup.add(chromeNode);
    this.chromeHeight = chromeHeight || 0;
    this.hasFrame = !!chromeNode;
    this._updateClip();
    this._layout();
  }

  setPadding(px) {
    this.padding = Math.max(0, px | 0);
    this._updateClip();
    this._layout();
  }

  setBackground({ type, color, from, to }) {
    if (type) this.bgType = type;
    if (type === 'solid' && color) this.bgColor = color;
    if (type === 'gradient') {
      this.bgFrom = from || this.bgFrom;
      this.bgTo = to || this.bgTo;
    }
    this.transparentBg = (this.bgType === 'transparent');
    this._refreshBackground();
  }

  _refreshBackground() {
    // Hide the background at zero padding to prevent color bleeding at image edges.
    const hide = this.transparentBg || this.padding <= 0;
    if (hide) {
      this.background.fill(null);
      this.background.fillLinearGradientColorStops(null);
      this.background.opacity(0);
    } else if (this.bgType === 'gradient' && this.bgFrom && this.bgTo) {
      this.background.fill(null);
      this.background.fillLinearGradientStartPoint({ x: 0, y: 0 });
      this.background.fillLinearGradientEndPoint({
        x: this.contentWidth,
        y: this.contentHeight,
      });
      this.background.fillLinearGradientColorStops([0, this.bgFrom, 1, this.bgTo]);
      this.background.opacity(1);
    } else {
      this.background.fillLinearGradientColorStops(null);
      this.background.fill(this.bgColor);
      this.background.opacity(1);
    }
    this.contentLayer.batchDraw();
  }

  setShadow(strength) {
    // strength: 0 (off) to ~60 (very pronounced)
    this.shadowStrength = Math.max(0, +strength || 0);
    this._layout();
  }

  setRadius(px) {
    this.frameRadius = Math.max(0, px | 0);
    this._updateClip();
    this._layout();
  }

  _effectiveRadius() {
    // Zero padding keeps the frame flush with the image edges.
    if (!this.hasFrame || this.padding <= 0) return 0;
    return this.frameRadius;
  }

  _updateClip() {
    const r = this._effectiveRadius();
    if (this.hasFrame && r > 0) {
      this.frameGroup.clipFunc((ctx) => {
        const w = this.screenshotWidth;
        const h = this.chromeHeight + this.screenshotHeight;
        ctx.beginPath();
        // Match Konva's native cornerRadius rendering (arcTo, not quadratic)
        // so the shadow plate behind aligns pixel-for-pixel.
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(0, 0, w, h, r);
        } else {
          ctx.moveTo(r, 0);
          ctx.lineTo(w - r, 0);
          ctx.arcTo(w, 0, w, r, r);
          ctx.lineTo(w, h - r);
          ctx.arcTo(w, h, w - r, h, r);
          ctx.lineTo(r, h);
          ctx.arcTo(0, h, 0, h - r, r);
          ctx.lineTo(0, r);
          ctx.arcTo(0, 0, r, 0, r);
        }
        ctx.closePath();
      });
    } else {
      this.frameGroup.clipFunc(null);
    }
  }

  _layout() {
    if (!this.screenshotImage) return;
    const p = this.padding;
    const frameW = this.screenshotWidth;
    const frameH = this.chromeHeight + this.screenshotHeight;
    this.contentWidth = frameW + p * 2;
    this.contentHeight = frameH + p * 2;

    this.background.position({ x: 0, y: 0 });
    this.background.size({ width: this.contentWidth, height: this.contentHeight });

    this.frameGroup.position({ x: p, y: p });
    this.chromeGroup.position({ x: 0, y: 0 });
    this.screenshotImage.position({ x: 0, y: this.chromeHeight });

    // Shadow plate is slightly inset so its fill never bleeds past the
    // frame's rounded clip (sub-pixel anti-aliasing differences).
    const r = this._effectiveRadius();
    const inset = 1.5;
    this.shadowPlate.position({ x: p + inset, y: p + inset });
    this.shadowPlate.size({ width: frameW - inset * 2, height: frameH - inset * 2 });
    this.shadowPlate.cornerRadius(Math.max(0, r - inset));
    const s = this.shadowStrength;
    this.shadowPlate.shadowBlur(s);
    this.shadowPlate.shadowOpacity(Math.min(0.4, 0.08 + s * 0.005));
    this.shadowPlate.shadowOffsetY(Math.round(s * 0.55));
    this.shadowPlate.visible(this.hasFrame && s > 0 && this.padding > 0);

    this._refreshBackground();
    this._applyZoom();
  }

  fitToHost() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.stage.size({ width: w, height: h });
    if (!this.contentWidth || !this.contentHeight) return;
    const margin = 24;
    const fitX = (w - margin * 2) / this.contentWidth;
    const fitY = (h - margin * 2) / this.contentHeight;
    this.zoom = Math.max(0.05, Math.min(fitX, fitY, 1));
    this._applyZoom();
  }

  setZoom(z) {
    this.zoom = Math.max(0.05, Math.min(5, z));
    this._applyZoom();
  }

  getZoom() { return this.zoom; }

  _applyZoom() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const scaledW = this.contentWidth * this.zoom;
    const scaledH = this.contentHeight * this.zoom;
    // Round offsets to integer pixels — sub-pixel positioning makes Konva
    // anti-alias the frame edges, which is visible on the editor preview.
    const offsetX = Math.round(Math.max(0, (w - scaledW) / 2));
    const offsetY = Math.round(Math.max(0, (h - scaledH) / 2));
    this.contentLayer.scale({ x: this.zoom, y: this.zoom });
    this.contentLayer.position({ x: offsetX, y: offsetY });
    this.annotationLayer.scale({ x: this.zoom, y: this.zoom });
    this.annotationLayer.position({
      x: offsetX + this.padding * this.zoom,
      y: offsetY + (this.padding + this.chromeHeight) * this.zoom,
    });
    this.contentLayer.batchDraw();
    this.annotationLayer.batchDraw();
  }

  pointerToScreenshot() {
    const pos = this.stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - this.annotationLayer.x()) / this.zoom,
      y: (pos.y - this.annotationLayer.y()) / this.zoom,
    };
  }

  exportToCanvas() {
    const out = document.createElement('canvas');
    out.width = this.contentWidth;
    out.height = this.contentHeight;
    const ctx = out.getContext('2d');

    const contentCanvas = this._exportLayer(this.contentLayer, this.contentWidth, this.contentHeight);
    ctx.drawImage(contentCanvas, 0, 0);

    const annotations = this._exportLayer(this.annotationLayer, this.screenshotWidth, this.screenshotHeight);
    ctx.drawImage(annotations, this.padding, this.padding + this.chromeHeight);

    return out;
  }

  _exportLayer(layer, width, height) {
    const scale = layer.scale();
    const position = layer.position();
    const controls = layer.find('.editor-only').map((node) => ({ node, visible: node.visible() }));
    try {
      layer.scale({ x: 1, y: 1 });
      layer.position({ x: 0, y: 0 });
      for (const { node } of controls) node.visible(false);
      return layer.toCanvas({ width, height, pixelRatio: 1 });
    } finally {
      layer.scale(scale);
      layer.position(position);
      for (const { node, visible } of controls) node.visible(visible);
    }
  }

  exportToBlob(type = 'image/png', quality = 0.92) {
    const canvas = this.exportToCanvas();
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to encode the image. Try a smaller capture.'));
      }, type, quality);
    });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load the screenshot.'));
    img.src = src;
  });
}
