import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const background = await readFile(new URL('../background/background.js', import.meta.url), 'utf8');
const scrollCapture = await readFile(new URL('../content/scroll-capture.js', import.meta.url), 'utf8');

for (const failure of ['start', 'plan', 'capture', 'decode', 'draw', 'encode', null]) {
  test(`full capture restores the page (${failure ? `${failure} failure` : 'success'})`, async () => {
    let restored = false;
    let closed = false;
    const draws = [];
    const context = vm.createContext({
      browser: {
        runtime: { onMessage: { addListener() {} } },
        scripting: {
          async executeScript({ files, func }) {
            if (files) return;
            if (func.toString().includes('.start()')) {
              if (failure === 'start') throw new Error('start failed');
              return [{ result: failure === 'plan' ? null : {
                dpr: 1, viewportWidth: 100, totalHeight: 100,
                steps: [{ y: 0, scrollY: 0, cropTop: 0 }],
              } }];
            }
            if (func.toString().includes('.finish')) restored = true;
          },
        },
        tabs: {
          async captureVisibleTab() {
            if (failure === 'capture') throw new Error('capture failed');
            return 'data:image/png;base64,';
          },
        },
      },
      setTimeout: (fn) => fn(),
      fetch: async () => ({ blob: async () => ({}) }),
      createImageBitmap: async () => {
        if (failure === 'decode') throw new Error('decode failed');
        return { width: 100, height: 100, close() { closed = true; } };
      },
      OffscreenCanvas: class {
        getContext() {
          return { drawImage(...args) {
            if (failure === 'draw') throw new Error('draw failed');
            draws.push(args.slice(1));
          } };
        }
        async convertToBlob() {
          if (failure === 'encode') throw new Error('encode failed');
          return 'encoded screenshot';
        }
      },
    });
    vm.runInContext(background, context);
    const capture = vm.runInContext('captureFull({ id: 1, windowId: 1 })', context);
    if (failure) await assert.rejects(capture);
    else {
      assert.equal((await capture).blob, 'encoded screenshot');
      assert.deepEqual(draws, [[0, 0, 100, 100, 0, 0, 100, 100]]);
    }
    assert.equal(restored, true);
    if (!failure || failure === 'draw' || failure === 'encode') assert.equal(closed, true);
  });
}

test('scroll capture restores inline display priority and scroll position', () => {
  const style = {
    value: 'flex', priority: 'important',
    get display() { return this.value; },
    set display(value) { this.value = value; this.priority = ''; },
    getPropertyValue() { return this.display; },
    getPropertyPriority() { return this.priority; },
    setProperty(_name, value, priority = '') { this.display = value; this.priority = priority; },
    removeProperty() { this.display = ''; this.priority = ''; },
  };
  let removed = false;
  let scroll;
  const window = {
    scrollX: 10, scrollY: 120, innerHeight: 100, devicePixelRatio: 1,
    scrollTo(...args) { scroll = args; },
  };
  vm.runInNewContext(scrollCapture, {
    window,
    document: {
      body: {
        scrollHeight: 250,
        getElementsByTagName: () => [{ style, getBoundingClientRect: () => ({ width: 20, height: 20 }) }],
      },
      documentElement: { clientWidth: 100, scrollHeight: 250, appendChild() {} },
      createElement: () => ({ remove() { removed = true; } }),
    },
    getComputedStyle: () => ({ position: 'fixed' }),
  });
  const plan = window.__frameScrollCapture.start();
  assert.deepEqual(JSON.parse(JSON.stringify(plan.steps)), [
    { y: 0, scrollY: 0, cropTop: 0 },
    { y: 100, scrollY: 100, cropTop: 0 },
    { y: 200, scrollY: 150, cropTop: 50 },
  ]);
  window.__frameScrollCapture.finish();
  assert.equal(style.display, 'flex');
  assert.equal(style.priority, 'important');
  assert.deepEqual(JSON.parse(JSON.stringify(scroll)), [{ left: 10, top: 120, behavior: 'instant' }]);
  assert.equal(removed, true);
  assert.equal(window.__frameScrollCapture, undefined);
});
