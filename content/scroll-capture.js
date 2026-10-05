// Fixed and sticky elements must be hidden before measuring the capture height.

(() => {
  if (window.__frameScrollCapture) return;

  const state = {
    originalScrollX: 0,
    originalScrollY: 0,
    fixedEls: [],
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
          out.push({
            el,
            originalDisplay: el.style.getPropertyValue('display'),
            originalPriority: el.style.getPropertyPriority('display'),
          });
        }
      }
    }
    return out;
  }

  window.__frameScrollCapture = {
    start() {
      state.originalScrollX = window.scrollX;
      state.originalScrollY = window.scrollY;

      const style = document.createElement('style');
      style.id = '__frame-scroll-capture-style';
      style.textContent = `
        html { scrollbar-width: none !important; }
        html, body { scroll-behavior: auto !important; scroll-snap-type: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar,
        *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      `;
      document.documentElement.appendChild(style);
      state.styleEl = style;

      state.fixedEls = findFixedAndSticky();
      for (const f of state.fixedEls) {
        f.el.style.setProperty('display', 'none', 'important');
      }

      const dpr = window.devicePixelRatio || 1;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const totalHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );

      // Crop the overlap at the top of the last viewport.
      const steps = [];
      let y = 0;
      while (y < totalHeight) {
        const remaining = totalHeight - y;
        if (remaining >= viewportHeight) {
          steps.push({ y, scrollY: y, cropTop: 0 });
          y += viewportHeight;
        } else {
          const scrollY = Math.max(0, totalHeight - viewportHeight);
          const cropTop = viewportHeight - remaining;
          steps.push({ y, scrollY, cropTop });
          break;
        }
      }

      return { dpr, viewportWidth, viewportHeight, totalHeight, steps };
    },

    scrollTo(scrollY) {
      window.scrollTo({ left: 0, top: scrollY, behavior: 'instant' });
    },

    finish() {
      if (state.styleEl) {
        state.styleEl.remove();
        state.styleEl = null;
      }
      for (const f of state.fixedEls) {
        f.el.style.setProperty('display', f.originalDisplay, f.originalPriority);
      }
      window.scrollTo({ left: state.originalScrollX, top: state.originalScrollY, behavior: 'instant' });
      delete window.__frameScrollCapture;
    },
  };

  return true;
})();
