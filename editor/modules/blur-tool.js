const DEFAULT_BLUR = 16;
const DEFAULT_PIXEL = 14;

export class BlurTool {
  constructor({ engine, onSelectionChange }) {
    this.engine = engine;
    this.onSelectionChange = onSelectionChange || (() => {});
    this.active = false;
    this.currentStyle = 'pixelate';
    this.strengths = { blur: DEFAULT_BLUR, pixelate: DEFAULT_PIXEL };
    this.nodes = [];
    this.transformer = new Konva.Transformer({
      name: 'editor-only',
      flipEnabled: false,
      rotateEnabled: false,
      keepRatio: false,
      anchorSize: 8,
      borderStroke: '#7c3aed',
      anchorStroke: '#7c3aed',
      anchorFill: '#ffffff',
    });
    this.engine.annotationLayer.add(this.transformer);

    this._drawing = null;
    this._bindStageEvents();
  }

  setActive(active) {
    this.active = active;
    this.engine.stage.container().style.cursor = active ? 'crosshair' : 'default';
    if (!active) {
      this._drawing?.rect.destroy();
      this._drawing = null;
      this.deselect();
    }
  }

  setStyleForNew(style) {
    this.currentStyle = style;
  }

  _bindStageEvents() {
    const stage = this.engine.stage;

    stage.on('mousedown touchstart', (e) => {
      if (!this.active) return;
      if (e.target !== stage && e.target.getParent() === this.transformer) return;
      if (this.nodes.includes(e.target)) {
        this._select(e.target);
        return;
      }
      this.deselect();

      const pos = this.engine.pointerToScreenshot();
      if (!pos) return;
      if (pos.x < 0 || pos.y < 0) return;
      if (pos.x > this.engine.screenshotWidth || pos.y > this.engine.screenshotHeight) return;

      this._drawing = {
        startX: pos.x,
        startY: pos.y,
        rect: new Konva.Rect({
          name: 'editor-only',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          fill: 'rgba(124, 58, 237, 0.18)',
          stroke: '#7c3aed',
          strokeWidth: 1,
          dash: [4, 4],
          listening: false,
        }),
      };
      this.engine.annotationLayer.add(this._drawing.rect);
    });

    stage.on('mousemove touchmove', () => {
      if (!this._drawing) return;
      const pos = this.engine.pointerToScreenshot();
      if (!pos) return;
      const { startX, startY, rect } = this._drawing;
      const x = Math.min(startX, pos.x);
      const y = Math.min(startY, pos.y);
      const w = Math.abs(pos.x - startX);
      const h = Math.abs(pos.y - startY);
      rect.position({ x, y });
      rect.size({ width: w, height: h });
      this.engine.annotationLayer.batchDraw();
    });

    stage.on('mouseup touchend', () => {
      if (!this._drawing) return;
      const { rect } = this._drawing;
      const w = rect.width();
      const h = rect.height();
      this._drawing = null;
      if (w < 6 || h < 6) {
        rect.destroy();
        this.engine.annotationLayer.batchDraw();
        return;
      }
      const node = this._createNode({
        x: rect.x(), y: rect.y(),
        width: w, height: h,
        style: this.currentStyle,
        strength: this.strengths[this.currentStyle],
      });
      rect.destroy();
      this._select(node);
    });

    stage.on('click tap', (e) => {
      if (this.active) return;
      if (this.nodes.includes(e.target)) {
        this._select(e.target);
      } else if (e.target.getParent() !== this.transformer) {
        this.deselect();
      }
    });
  }

  _createNode({ x, y, width, height, style, strength }) {
    const node = (style === 'mask')
      ? new Konva.Rect({
          x, y, width, height,
          fill: '#000000',
          draggable: true,
          name: 'redact-node',
        })
      : new Konva.Image({
          x, y, width, height,
          image: this.engine.screenshot,
          cropX: x, cropY: y,
          cropWidth: width, cropHeight: height,
          draggable: true,
          name: 'redact-node',
        });

    node._frameStyle = style;
    node._frameStrength = strength != null ? strength : (style === 'pixelate' ? DEFAULT_PIXEL : DEFAULT_BLUR);

    this.engine.annotationLayer.add(node);
    this.transformer.moveToTop();
    this._refresh(node);

    node.on('dragmove', () => {
      if (node._frameStyle !== 'mask') {
        node.cropX(node.x());
        node.cropY(node.y());
        this._refresh(node);
      } else {
        this.engine.annotationLayer.batchDraw();
      }
    });

    node.on('transform', () => {
      const w = Math.max(8, Math.abs(node.width() * node.scaleX()));
      const h = Math.max(8, Math.abs(node.height() * node.scaleY()));
      node.width(w);
      node.height(h);
      node.scaleX(1);
      node.scaleY(1);
      if (node._frameStyle !== 'mask') {
        node.cropX(node.x());
        node.cropY(node.y());
        node.cropWidth(w);
        node.cropHeight(h);
        this._refresh(node);
      }
    });

    node.on('transformend dragend', () => this._refresh(node));

    this.nodes.push(node);
    return node;
  }

  _refresh(node) {
    if (node._frameStyle === 'mask') {
      this.engine.annotationLayer.batchDraw();
      return;
    }
    node.cache();
    if (node._frameStyle === 'pixelate') {
      node.filters([Konva.Filters.Pixelate]);
      node.pixelSize(Math.max(2, node._frameStrength | 0));
    } else {
      node.filters([Konva.Filters.Blur]);
      node.blurRadius(node._frameStrength);
    }
    this.engine.annotationLayer.batchDraw();
  }

  setStrength(node, strength) {
    node._frameStrength = Math.max(1, Math.min(80, strength));
    this._refresh(node);
  }

  setStyle(node, style) {
    if (node._frameStyle === style) return node;

    const x = node.x(), y = node.y();
    const width = node.width(), height = node.height();
    const strength = (style === 'pixelate' && node._frameStyle === 'blur') ? DEFAULT_PIXEL
                    : (style === 'blur' && node._frameStyle === 'pixelate') ? DEFAULT_BLUR
                    : node._frameStrength;

    const idx = this.nodes.indexOf(node);
    if (idx !== -1) this.nodes.splice(idx, 1);
    node.destroy();

    const fresh = this._createNode({ x, y, width, height, style, strength });
    this.transformer.nodes([fresh]);
    this.onSelectionChange(fresh);
    return fresh;
  }

  _select(node) {
    this.transformer.nodes([node]);
    this.engine.annotationLayer.batchDraw();
    this.onSelectionChange(node);
  }

  deselect() {
    this.transformer.nodes([]);
    this.engine.annotationLayer.batchDraw();
    this.onSelectionChange(null);
  }

  deleteSelected() {
    const nodes = this.transformer.nodes();
    for (const n of nodes) {
      const idx = this.nodes.indexOf(n);
      if (idx !== -1) this.nodes.splice(idx, 1);
      n.destroy();
    }
    this.deselect();
  }
}
