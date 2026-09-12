(() => {
  'use strict';

  // V0.6.3 UI layer adapter.
  // app-v062 already supports multiple simultaneous image overlays in preview/export.
  // This adapter presents every imported image as its own timeline layer instead of
  // putting every image clip into one shared row. The real clip DOM nodes are moved,
  // not cloned, so existing select/trim/drag/delete handlers continue to work.

  const MASTER_LANE_ID = 'imageLane';
  let arranging = false;
  let scheduled = false;
  let observer = null;

  function getMasterLane() {
    return document.getElementById(MASTER_LANE_ID);
  }

  function getMasterRow() {
    return getMasterLane()?.closest('.track-row') || null;
  }

  function cleanupExtraRows() {
    document.querySelectorAll('.image-layer-extra').forEach(row => row.remove());
  }

  function scheduleArrange() {
    if (arranging || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      arrangeImageLayers();
    });
  }

  function arrangeImageLayers() {
    const lane = getMasterLane();
    const row = getMasterRow();
    if (!lane || !row || arranging) return;

    const clips = [...lane.querySelectorAll('.tl-clip.image[data-id]')];
    arranging = true;
    try {
      cleanupExtraRows();

      const header = row.querySelector('.track-header strong');
      if (!clips.length) {
        if (header) header.textContent = '图像图层';
        row.style.display = '';
        return;
      }

      // Later imported images are higher in preview/export stacking order.
      // Keep the first (lowest) image in the original lane and create one row
      // per additional image. Higher layers are inserted above lower layers.
      if (header) header.textContent = clips.length === 1 ? '图像图层 1' : '图像图层 1（底层）';
      row.style.display = '';

      const laneWidth = lane.style.width || `${Math.max(900, lane.scrollWidth)}px`;
      let insertBefore = row;

      for (let i = clips.length - 1; i >= 1; i--) {
        const clip = clips[i];
        const layerNo = i + 1;
        const layerRow = document.createElement('div');
        layerRow.className = 'track-row image-layer-extra';
        layerRow.dataset.imageLayer = String(layerNo);

        const layerHeader = document.createElement('div');
        layerHeader.className = 'track-header';
        layerHeader.style.width = '116px';
        layerHeader.innerHTML = `<strong>图像图层 ${layerNo}${i === clips.length - 1 ? '（顶层）' : ''}</strong>`;

        const layerLane = document.createElement('div');
        layerLane.className = 'track-lane image-layer-lane';
        layerLane.style.width = laneWidth;
        layerLane.dataset.imageLayer = String(layerNo);
        layerLane.appendChild(clip);

        layerRow.append(layerHeader, layerLane);
        row.parentNode.insertBefore(layerRow, insertBefore);
        insertBefore = layerRow;
      }
    } finally {
      arranging = false;
    }
  }

  function install() {
    const lane = getMasterLane();
    if (!lane) {
      setTimeout(install, 60);
      return;
    }

    observer?.disconnect();
    observer = new MutationObserver(() => {
      if (!arranging) scheduleArrange();
    });
    observer.observe(lane, { childList: true });

    // Timeline width changes on zoom/fit. Mirror the master lane width to every
    // generated layer without touching the editor's internal state.
    const resizeObserver = new MutationObserver(() => {
      if (arranging) return;
      const width = lane.style.width;
      if (!width) return;
      document.querySelectorAll('.image-layer-lane').forEach(el => { el.style.width = width; });
    });
    resizeObserver.observe(lane, { attributes: true, attributeFilter: ['style'] });

    arrangeImageLayers();
  }

  document.addEventListener('DOMContentLoaded', install);
})();
