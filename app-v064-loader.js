(() => {
  'use strict';

  async function boot() {
    try {
      const res = await fetch('./app-v062.js?v=064-20260912', { cache: 'no-store' });
      if (!res.ok) throw new Error(`app-v062.js ${res.status}`);
      let src = await res.text();

      const stateNeedle = 'const state={';
      if (!src.includes(stateNeedle)) throw new Error('Cannot locate webCut state declaration');
      src = src.replace(stateNeedle, 'const state=window.__webCutState={');

      const downloadNeedle = "function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}";
      if (src.includes(downloadNeedle)) {
        src = src.replace(
          downloadNeedle,
          "function downloadBlob(blob,name){if(typeof window.__webCutDownloadBlob==='function'){return window.__webCutDownloadBlob(blob,name);}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}"
        );
      } else {
        console.warn('[webCut V0.6.4] downloadBlob bridge needle not found; browser fallback will remain active');
      }

      const endNeedle = '})();';
      const pos = src.lastIndexOf(endNeedle);
      if (pos < 0) throw new Error('Cannot locate webCut bootstrap end');

      const expose = `\nwindow.__webCutApi={renderAll,renderTimeline,renderInspector,syncPreview,assetById,findClip,selectedClip,projectDuration,seekTo};\n`;
      src = src.slice(0, pos) + expose + src.slice(pos);

      (0, eval)(src);
      window.dispatchEvent(new CustomEvent('webcut:ready'));
    } catch (err) {
      console.error('[webCut V0.6.4] bootstrap failed:', err);
      const empty = document.getElementById('emptyPreview');
      if (empty) empty.textContent = `webCut 启动失败：${err?.message || err}`;
    }
  }

  boot();
})();
