/* Fixed Qwen Space HTTP API: no runtime CDN or Hugging Face Hub lookup. */
(() => {
  'use strict';
  const SPACE = 'https://qwen-qwen3-asr-demo.hf.space';
  function resultFromSse(raw) {
    for (const block of raw.replace(/\r\n/g, '\n').split('\n\n')) {
      const lines = block.split('\n');
      const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (event === 'error') throw new Error('Space 执行失败：' + (data || '服务内部错误').slice(0, 250));
      if (event === 'complete') {
        try { return JSON.parse(data); } catch { throw new Error('Space 返回的识别结果不是有效 JSON'); }
      }
    }
    throw new Error('Space 连接中断或未返回完整结果，请稍后重试');
  }
  async function create({ token = '', signal, direct = false } = {}) {
    let route = 'direct';
    const invoke = window.__TAURI__?.core?.invoke;
    if (!direct && invoke) route = 'desktop';
    else if (!direct && /^https?:$/.test(location.protocol)) {
      try {
        const response = await fetch('/api/qwen/status', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
        if (response.ok && (await response.json()).webcut_qwen_proxy === true) route = 'server';
      } catch { /* Static hosts use the fixed Space endpoint directly. */ }
    }
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    async function request(path, { method = 'GET', body, contentType, stage } = {}) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, 180000);
      let nativeAbort;
      try {
        let response;
        if (route === 'desktop') {
          let bytes = [];
          if (body instanceof FormData) {
            const encoded = new Request('https://localhost/', { method: 'POST', body });
            contentType = encoded.headers.get('content-type'); bytes = Array.from(new Uint8Array(await encoded.arrayBuffer()));
          } else if (body) bytes = Array.from(new TextEncoder().encode(body));
          response = await Promise.race([invoke('qwen_request', { path, method, body: bytes, contentType: contentType || '', token }), new Promise((_, reject) => {
            nativeAbort = () => reject(new DOMException('已取消或请求超时', 'AbortError'));
            controller.signal.addEventListener('abort', nativeAbort, { once: true });
            if (controller.signal.aborted) nativeAbort();
          })]);
        } else {
          const headers = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          if (contentType) headers['Content-Type'] = contentType;
          if (route === 'server') headers['X-WebCut-ASR'] = '1';
          const res = await fetch((route === 'server' ? '/api/qwen' : SPACE + '/gradio_api') + path, { method, headers, body, signal: controller.signal });
          response = { status: res.status, body: await res.text() };
        }
        if (response.status < 200 || response.status >= 300) {
          const hint = response.status === 401 || response.status === 403 ? 'Token 无效、权限不足或 Space 拒绝访问' : response.status === 429 ? 'Space 限流或额度不足，请稍后重试' : response.status === 502 || response.status === 504 ? '转发端无法连接 Space；检查运行电脑/服务器的外网或代理设置' : 'Space 服务请求失败';
          throw new Error(`${stage}：HTTP ${response.status}，${hint}`);
        }
        return response.body;
      } catch (error) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        if (controller.signal.aborted) throw new Error(`${stage}超时（3 分钟）`);
        if (/fetch|network|load failed/i.test(String(error?.message || error))) {
          throw new Error(`${stage}网络连接失败（${route === 'direct' ? '浏览器直连' : route === 'desktop' ? 'EXE 转发' : 'Python 转发'}）。请确认运行端可以访问 ${SPACE}；网页直连失败时请用最新版启动脚本运行，或选择可访问 Space 的网络。`);
        }
        throw error;
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        if (nativeAbort) controller.signal.removeEventListener('abort', nativeAbort);
      }
    }
    return {
      label: route === 'desktop' ? 'EXE 转发' : route === 'server' ? 'Python 转发' : '浏览器直连',
      async recognize(blob, { context, language, enable_itn }) {
        const fd = new FormData(); fd.append('files', blob, 'webcut_chunk.wav');
        const uploaded = JSON.parse(await request('/upload', { method: 'POST', body: fd, stage: '上传音频' }));
        if (!Array.isArray(uploaded) || typeof uploaded[0] !== 'string') throw new Error('Space 上传响应无效');
        const call = JSON.parse(await request('/call/asr_inference', { method: 'POST', contentType: 'application/json', stage: '提交识别', body: JSON.stringify({ data: [{ path: uploaded[0], orig_name: 'webcut_chunk.wav', meta: { _type: 'gradio.FileData' } }, context, language, enable_itn] }) }));
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(call.event_id || '')) throw new Error('Space 未返回有效任务编号');
        const raw = await request('/call/asr_inference/' + call.event_id, { stage: '等待识别结果' });
        return window.WebCutSubtitles.hfText(resultFromSse(raw));
      }
    };
  }
  window.WebCutQwen = { create, resultFromSse };
})();
