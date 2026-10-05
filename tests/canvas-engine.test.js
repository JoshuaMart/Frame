import assert from 'node:assert/strict';
import test from 'node:test';
import { CanvasEngine } from '../editor/modules/canvas-engine.js';

function layer({ fail = false, overlay = false } = {}) {
  let scale = { x: 0.5, y: 0.5 };
  let position = { x: 40, y: 20 };
  let visible = true;
  const controls = { visible(value) { if (value !== undefined) visible = value; return visible; } };
  return {
    scale(value) { if (value) scale = value; return scale; },
    position(value) { if (value) position = value; return position; },
    find: () => overlay ? [controls] : [],
    toCanvas() {
      if (fail) throw new Error('render failed');
      if (overlay) assert.equal(visible, false, 'selection controls must not appear in exports');
      return {};
    },
    controls,
  };
}

for (const failure of [null, 'content', 'annotation']) {
  test(`export excludes editor controls and restores transforms (${failure || 'success'})`, (t) => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      createElement: () => ({ getContext: () => ({ drawImage() {}, fillRect() {} }) }),
    };
    t.after(() => { globalThis.document = previousDocument; });
    const engine = Object.assign(Object.create(CanvasEngine.prototype), {
      contentWidth: 120, contentHeight: 120, screenshotWidth: 100, screenshotHeight: 100,
      padding: 10, chromeHeight: 0, transparentBg: true,
      contentLayer: layer({ fail: failure === 'content' }),
      annotationLayer: layer({ fail: failure === 'annotation', overlay: true }),
    });
    if (failure) assert.throws(() => engine.exportToCanvas(), /render failed/);
    else engine.exportToCanvas();
    for (const exportedLayer of [engine.contentLayer, engine.annotationLayer]) {
      assert.deepEqual(exportedLayer.scale(), { x: 0.5, y: 0.5 });
      assert.deepEqual(exportedLayer.position(), { x: 40, y: 20 });
      assert.equal(exportedLayer.controls.visible(), true);
    }
  });
}

test('export rejects when the browser cannot encode the canvas', async () => {
  const engine = Object.assign(Object.create(CanvasEngine.prototype), {
    exportToCanvas: () => ({ toBlob: (callback) => callback(null) }),
  });
  await assert.rejects(engine.exportToBlob(), /encode/i);
});

for (const succeeds of [true, false]) {
  test(`screenshot blob URL is released after ${succeeds ? 'loading' : 'failure'}`, async (t) => {
    const previousImage = globalThis.Image;
    globalThis.Image = class {
      set src(_value) { if (succeeds) this.onload(); else this.onerror(new Error('image failed')); }
    };
    t.after(() => { globalThis.Image = previousImage; });
    t.mock.method(URL, 'createObjectURL', () => 'blob:test');
    const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
    const engine = Object.create(CanvasEngine.prototype);
    // Stop after image decoding: this test only exercises URL ownership.
    Object.defineProperty(engine, 'screenshot', { set() { throw new Error('decoded'); } });
    await assert.rejects(engine.loadScreenshotFromBlob({}));
    assert.equal(revoke.mock.callCount(), 1);
    assert.equal(revoke.mock.calls[0].arguments[0], 'blob:test');
  });
}
