(() => {
  'use strict';

  const isDesktop = () => !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  const statusEl = () => document.getElementById('exportStatus');

  function setStatus(text) {
    const el = statusEl();
    if (el) el.textContent = text;
  }

  function browserDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function saveWithFileSystemAccess(blob, name) {
    if (!isDesktop() || typeof window.showSaveFilePicker !== 'function') return false;

    try {
      setStatus('请选择保存位置…');
      const handle = await window.showSaveFilePicker({ suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`导出完成：${handle.name || name}`);
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') {
        setStatus('已取消保存');
        return true;
      }
      console.warn('[webCut] File System Access save failed, falling back to Tauri:', err);
      return false;
    }
  }

  async function saveWithTauri(blob, name) {
    if (!isDesktop()) return false;
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return false;

    try {
      setStatus('请选择保存位置…');
      const path = await invoke('pick_save_path', { defaultName: name });
      if (!path) {
        setStatus('已取消保存');
        return true;
      }

      const chunkSize = 512 * 1024;
      const total = blob.size || 0;
      let offset = 0;
      let first = true;

      while (offset < total) {
        const end = Math.min(total, offset + chunkSize);
        const bytes = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
        await invoke('write_export_chunk', {
          path,
          chunk: Array.from(bytes),
          first
        });
        first = false;
        offset = end;
        const pct = total ? Math.min(100, (offset / total) * 100) : 100;
        setStatus(`正在保存 ${pct.toFixed(1)}%…`);
      }

      if (total === 0) {
        await invoke('write_export_chunk', { path, chunk: [], first: true });
      }

      setStatus(`导出完成：${path}`);
      return true;
    } catch (err) {
      console.error('[webCut] Tauri save failed:', err);
      setStatus(`保存失败：${err?.message || err}`);
      return true;
    }
  }

  window.__webCutDownloadBlob = async (blob, name) => {
    if (await saveWithFileSystemAccess(blob, name)) return;
    if (await saveWithTauri(blob, name)) return;
    browserDownload(blob, name);
  };
})();
