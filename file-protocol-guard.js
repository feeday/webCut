(() => {
  'use strict';

  if (location.protocol !== 'file:') return;

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.id = 'fileProtocolWarning';
    banner.style.cssText = [
      'position:fixed','left:12px','right:12px','top:66px','z-index:9999',
      'background:#fff3cd','color:#6b5200','border:1px solid #f2d36b',
      'border-radius:8px','padding:10px 12px','font-size:14px',
      'box-shadow:0 4px 16px #0002'
    ].join(';');
    banner.innerHTML = '<b>当前是 file:// 直接打开模式。</b> 预览可以使用，但剪辑导出 / ASR 提取需要 Worker + WASM，浏览器会拦截。请双击项目里的 <b>启动-webCut.bat</b>，再从 <b>http://127.0.0.1:8080</b> 打开。媒体文件仍只在本机处理，不会上传到服务器。';
    document.body.appendChild(banner);

    const block = (id, statusId, message) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const status = document.getElementById(statusId);
        if (status) status.textContent = message;
        alert(message);
      }, true);
    };

    block(
      'runExportBtn',
      'exportStatus',
      '当前通过 file:// 直接打开，浏览器禁止 FFmpeg Worker/WASM 正常启动。请关闭本页，双击“启动-webCut.bat”，然后在 http://127.0.0.1:8080 使用。'
    );

    block(
      'runAsrBtn',
      'asrStatus',
      '当前通过 file:// 直接打开。Qwen ASR 前需要浏览器本地 FFmpeg 提取 WAV，因此请双击“启动-webCut.bat”，然后在 http://127.0.0.1:8080 使用。'
    );
  });
})();
