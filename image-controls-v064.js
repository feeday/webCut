(() => {
  'use strict';

  const waitReady = () => new Promise(resolve => {
    if (window.__webCutApi && window.__webCutState) return resolve();
    window.addEventListener('webcut:ready', () => resolve(), { once: true });
  });

  waitReady().then(() => {
    const api = window.__webCutApi;
    const state = window.__webCutState;
    const stage = document.getElementById('stage');
    const overlayLayer = document.getElementById('overlayLayer');
    const inspector = document.getElementById('imageFields');
    if (!stage || !overlayLayer || !inspector) return;

    inspector.insertAdjacentHTML('beforeend', `
      <div class="image-layer-actions">
        <button type="button" id="imgLayerTop">置顶</button>
        <button type="button" id="imgLayerUp">上移一层</button>
        <button type="button" id="imgLayerDown">下移一层</button>
        <button type="button" id="imgLayerBottom">置底</button>
      </div>
      <div class="image-edit-tip">预览中可直接拖动图片，拖右下角圆点缩放</div>
    `);

    const controls = {
      top: document.getElementById('imgLayerTop'),
      up: document.getElementById('imgLayerUp'),
      down: document.getElementById('imgLayerDown'),
      bottom: document.getElementById('imgLayerBottom')
    };

    function selectedImage() {
      if (state.selected?.kind !== 'images') return null;
      return state.images.find(c => c.id === state.selected.id) || null;
    }

    function reorder(mode) {
      const clip = selectedImage();
      if (!clip) return;
      const i = state.images.findIndex(c => c.id === clip.id);
      if (i < 0) return;
      let j = i;
      if (mode === 'top') j = state.images.length - 1;
      if (mode === 'up') j = Math.min(state.images.length - 1, i + 1);
      if (mode === 'down') j = Math.max(0, i - 1);
      if (mode === 'bottom') j = 0;
      if (j === i) return;
      const [item] = state.images.splice(i, 1);
      state.images.splice(j, 0, item);
      api.renderAll();
      syncSelectionFrame();
      window.dispatchEvent(new CustomEvent('webcut:image-order-changed'));
    }

    controls.top.onclick = () => reorder('top');
    controls.up.onclick = () => reorder('up');
    controls.down.onclick = () => reorder('down');
    controls.bottom.onclick = () => reorder('bottom');

    const box = document.createElement('div');
    box.className = 'image-selection-box hidden';
    box.innerHTML = '<div class="image-resize-handle" title="拖动缩放"></div>';
    overlayLayer.appendChild(box);
    const handle = box.querySelector('.image-resize-handle');

    function imageElement(clipId) {
      return window.__webCutState.overlayEls?.get?.(clipId) || null;
    }

    function syncSelectionFrame() {
      const clip = selectedImage();
      if (!clip) { box.classList.add('hidden'); return; }
      const img = imageElement(clip.id);
      if (!img || img.style.display === 'none') { box.classList.add('hidden'); return; }
      const stageRect = overlayLayer.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      box.classList.remove('hidden');
      box.style.left = `${r.left - stageRect.left}px`;
      box.style.top = `${r.top - stageRect.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    }

    function updateInspectorFields(clip) {
      const x = document.getElementById('imageX');
      const y = document.getElementById('imageY');
      const s = document.getElementById('imageScale');
      if (x) x.value = Math.round(clip.x * 10) / 10;
      if (y) y.value = Math.round(clip.y * 10) / 10;
      if (s) s.value = Math.round(clip.scale * 10) / 10;
    }

    function startMove(e) {
      if (e.target === handle) return;
      const clip = selectedImage();
      if (!clip) return;
      e.preventDefault();
      const rect = overlayLayer.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const origX = clip.x, origY = clip.y;
      const move = ev => {
        clip.x = Math.max(0, Math.min(100, origX + (ev.clientX - startX) / rect.width * 100));
        clip.y = Math.max(0, Math.min(100, origY + (ev.clientY - startY) / rect.height * 100));
        updateInspectorFields(clip);
        api.syncPreview(state.playhead, false);
        requestAnimationFrame(syncSelectionFrame);
      };
      const up = () => window.removeEventListener('pointermove', move);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    }

    function startResize(e) {
      const clip = selectedImage();
      if (!clip) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const origScale = clip.scale;
      const rect = overlayLayer.getBoundingClientRect();
      const move = ev => {
        clip.scale = Math.max(1, Math.min(200, origScale + (ev.clientX - startX) / rect.width * 100));
        updateInspectorFields(clip);
        api.syncPreview(state.playhead, false);
        requestAnimationFrame(syncSelectionFrame);
      };
      const up = () => window.removeEventListener('pointermove', move);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    }

    box.addEventListener('pointerdown', startMove);
    handle.addEventListener('pointerdown', startResize);

    overlayLayer.addEventListener('pointerdown', e => {
      const target = e.target.closest('.overlay-image');
      if (!target) return;
      for (const clip of state.images) {
        const el = imageElement(clip.id);
        if (el === target) {
          state.selected = { kind: 'images', id: clip.id };
          api.renderInspector();
          syncSelectionFrame();
          break;
        }
      }
    }, true);

    const mo = new MutationObserver(() => requestAnimationFrame(syncSelectionFrame));
    mo.observe(overlayLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', syncSelectionFrame);
    window.addEventListener('webcut:image-order-changed', syncSelectionFrame);
    document.getElementById('timeline')?.addEventListener('click', () => requestAnimationFrame(syncSelectionFrame));
    document.getElementById('playBtn')?.addEventListener('click', () => requestAnimationFrame(syncSelectionFrame));
    setInterval(syncSelectionFrame, 250);
  });
})();
