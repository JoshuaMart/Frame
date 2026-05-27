// Injected into the target tab for full-page capture.
// Exposes window.__frameScrollCapture.{start, scrollTo, finish}.
//
// Strategy:
//   - Inject a stylesheet that hides scrollbars (without using overflow:hidden,
//     which can block window.scrollTo).
//   - Find all position:fixed and position:sticky elements and hide them BEFORE
//     measuring scrollHeight — otherwise sticky/fixed footers contribute to the
//     measured height while being absent from subsequent chunks, causing the
//     last chunk to overshoot and duplicate content.
//   - Build a chunk plan based on the cleaned page.
//   - In finish(), restore everything.

(() => {
  if (window.__frameScrollCapture) return;

  const state = {
    originalScrollX: 0,
    originalScrollY: 0,
    fixedEls: [], // [{ el, originalDisplay }]
    styleEl: null,
  };

  function findFixedAndSticky() {
    const out = [];
    const all = document.body.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          out.push({ el, originalDisplay: el.style.display });
        }
      }
    }
    return out;
  }

  window.__frameScrollCapture = {
    start() {
      state.originalScrollX = window.scrollX;
      state.originalScrollY = window.scrollY;

      // Inject a non-invasive stylesheet that hides scrollbars without
      // blocking programmatic scrolling.
      const style = document.createElement('style');
      style.id = '__frame-scroll-capture-style';
      style.textContent = `
        html { scrollbar-width: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar,
        *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      `;
      document.documentElement.appendChild(style);
      state.styleEl = style;

      // Hide fixed + sticky elements BEFORE measuring — they pollute every
      // chunk and (for sticky elements) inflate scrollHeight.
      state.fixedEls = findFixedAndSticky();
      for (const f of state.fixedEls) {
        f.el.style.setProperty('display', 'none', 'important');
      }

      // Force a reflow before measuring.
      // eslint-disable-next-line no-unused-expressions
      document.documentElement.offsetHeight;

      const dpr = window.devicePixelRatio || 1;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const totalHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );

      // Plan chunks: each chunk is one viewport tall, except the last which
      // is captured with the page scrolled to its bottom and cropped at the
      // top to show only the remaining slice.
      const steps = [];
      let y = 0;
      while (y < totalHeight) {
        const remaining = totalHeight - y;
        if (remaining >= viewportHeight) {
          steps.push({ y, scrollY: y, cropTop: 0 });
          y += viewportHeight;
        } else {
          // Last chunk.
          const scrollY = Math.max(0, totalHeight - viewportHeight);
          const cropTop = viewportHeight - remaining;
          steps.push({ y, scrollY, cropTop });
          break;
        }
      }

      return { dpr, viewportWidth, viewportHeight, totalHeight, steps };
    },

    scrollTo(scrollY) {
      window.scrollTo(0, scrollY);
    },

    finish() {
      if (state.styleEl) {
        state.styleEl.remove();
        state.styleEl = null;
      }
      for (const f of state.fixedEls) {
        f.el.style.display = f.originalDisplay || '';
      }
      window.scrollTo(state.originalScrollX, state.originalScrollY);
      delete window.__frameScrollCapture;
    },
  };

  return true;
})();
