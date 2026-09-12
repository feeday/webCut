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
    banner.innerHTML = '<b>当前是 file:// 直接打开模式。</b> 预览可以使用，但 FFmpeg Worker/WASM 导出会被浏览器限制。Windows 请运行 <b>启动-webCut.bat</b>，CentOS/Linux 请运行 <b>start-centos.sh</b>。本机默认地址：<b>http://127.0.0.1:18080/</b>。';
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

    const msg = '当前通过 file:// 直接打开。请先启动 webCut HTTP 服务，再从 http://127.0.0.1:18080/ 或服务器地址访问。';
    block('runExportBtn', 'exportStatus', msg);
    block('runAsrBtn', 'asrStatus', msg);
  });
})();
