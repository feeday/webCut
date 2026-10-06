(() => {
  'use strict';
  function init() {
    const state = window.__webCutState, api = window.__webCutApi, util = window.WebCutSubtitles;
    const $ = id => document.getElementById(id);
    let busy = false, cancelled = false, controller, editing;
    const fingerprint = () => JSON.stringify([state.videos, state.audios, state.images, state.subtitles]);
    const status = text => { $('asrStatus').textContent = text; };
    const preview = document.createElement('div');
    preview.className = 'subtitle-preview'; $('stage').appendChild(preview);
    window.__webCutSubtitlePreview = t => {
      preview.textContent = state.subtitles.filter(s => t >= s.start && t < s.end).map(s => s.text).join('\n');
      preview.hidden = !preview.textContent;
    };
    function refresh() { api.renderAll(); }
    function edit(cue) {
      editing = cue; $('subtitleStart').value = cue.start.toFixed(3); $('subtitleEnd').value = cue.end.toFixed(3);
      $('subtitleText').value = cue.text; $('subtitleEditStatus').textContent = ''; $('subtitleEditDialog').showModal();
    }
    $('subtitleLane').addEventListener('dblclick', event => {
      const block = event.target.closest('.subtitle-block');
      if (block) edit(state.subtitles[[...$('subtitleLane').children].indexOf(block)]);
    });
    $('addSubtitleBtn').onclick = () => edit({ start: state.playhead, end: state.playhead + 2, text: '新字幕' });
    $('saveSubtitleBtn').onclick = () => {
      try {
        const [cue] = util.validate([{ start: $('subtitleStart').value, end: $('subtitleEnd').value, text: $('subtitleText').value }]);
        api.snapshot(); const i = state.subtitles.indexOf(editing);
        if (i < 0) state.subtitles.push(cue); else state.subtitles[i] = cue;
        state.subtitles.sort((a, b) => a.start - b.start); refresh(); $('subtitleEditDialog').close();
      } catch (e) { $('subtitleEditStatus').textContent = e.message; }
    };
    $('deleteSubtitleBtn').onclick = () => {
      if (state.subtitles.includes(editing)) { api.snapshot(); state.subtitles = state.subtitles.filter(s => s !== editing); refresh(); }
      $('subtitleEditDialog').close();
    };
    $('importSubtitleBtn').onclick = () => { $('subtitleInput').value = ''; $('subtitleInput').click(); };
    $('subtitleInput').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('字幕文件请小于 5 MB');
        const before = fingerprint(), cues = util.parse(await file.text());
        if (before !== fingerprint()) throw new Error('工程已变化，请重新导入');
        if (state.subtitles.length && !confirm(`将用 ${cues.length} 条字幕替换现有字幕，可撤销。继续？`)) return;
        api.snapshot(); state.subtitles = cues; refresh();
      } catch (e) { alert(`字幕导入失败：${e.message}`); }
    };
    for (const [id, format] of [['exportSrtBtn', 'srt'], ['exportVttBtn', 'vtt']]) {
      $(id).onclick = async () => {
        try { await api.downloadBlob(new Blob([util.serialize(state.subtitles, format)], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }), `webCut.${format}`); }
        catch (e) { alert(`字幕导出失败：${e.message}`); }
      };
    }
    let config = {};
    try {
      config = JSON.parse(localStorage.getItem('webcut.asr') || '{}');
      // Migrate the older version without retaining its plaintext token.
      delete config.token; localStorage.setItem('webcut.asr', JSON.stringify(config));
    } catch { /* Storage can be unavailable in privacy mode. */ }
    $('asrProvider').value = config.provider === 'custom' ? 'custom' : 'hf';
    $('asrUrl').value = config.url || ''; $('asrField').value = config.field || 'file';
    $('asrLanguage').value = config.language || 'auto'; $('asrContext').value = config.context || '';
    $('asrChunkSeconds').value = config.chunkSeconds || 8; $('asrItn').checked = !!config.itn;
    function providerUI() {
      const hf = $('asrProvider').value === 'hf';
      $('asrUrlLabel').hidden = hf; $('asrFieldLabel').hidden = hf; $('asrHfOptions').hidden = !hf;
      $('asrHelp').textContent = hf ? '固定调用 Qwen/Qwen3-ASR-Demo。Key 是 Hugging Face Token（hf_…），公共 Space 可尝试留空，不是阿里云 sk-… Key。' : '使用你自己的 multipart/form-data ASR 服务，需允许本页面跨域访问。';
      $('asrToken').placeholder = hf ? 'hf_…（公共 Space 可尝试留空）' : 'Bearer Token（可留空）';
    }
    $('asrProvider').onchange = () => { $('asrToken').value = ''; providerUI(); };
    providerUI(); $('asrBtn').onclick = () => $('asrDialog').showModal();
    $('saveAsrConfigBtn').onclick = () => {
      try {
        localStorage.setItem('webcut.asr', JSON.stringify({ provider: $('asrProvider').value, url: $('asrUrl').value.trim(), field: $('asrField').value.trim() || 'file', language: $('asrLanguage').value, context: $('asrContext').value, chunkSeconds: Number($('asrChunkSeconds').value), itn: $('asrItn').checked }));
        status('设置已保存；Key 仅在当前页面内存中使用，刷新后需重新填写。');
      } catch { status('浏览器不允许保存设置；本次仍可识别。'); }
    };
    function cancel() {
      if (!busy) return;
      cancelled = true; controller?.abort();
      status('已取消；等待当前音频处理结束，现有字幕保持不变。');
    }
    $('cancelAsrBtn').onclick = cancel;
    $('asrDialog').addEventListener('close', cancel);
    function check() { if (cancelled) throw new Error('识别已取消'); }
    $('runAsrBtn').onclick = async () => {
      if (busy) return;
      if (!state.videos.length && !state.audios.length) return status('请先打开视频或音频');
      const hf = $('asrProvider').value === 'hf', token = $('asrToken').value.trim();
      if (hf && token && !token.startsWith('hf_')) return status('这里需要 Hugging Face 的 hf_… Token，不是阿里云 API Key。');
      const chunkSeconds = Number($('asrChunkSeconds').value);
      if (hf && (!Number.isFinite(chunkSeconds) || chunkSeconds < 2 || chunkSeconds > 30)) return status('每段秒数需要在 2–30 之间');
      let url;
      if (!hf) {
        try { url = new URL($('asrUrl').value.trim()); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw 0; }
        catch { return status('请填写有效的 HTTP(S) API 地址'); }
      }
      if (state.subtitles.length && !confirm('识别成功后将替换现有字幕，可撤销。继续？')) return;
      const before = fingerprint(), assets = state.assets;
      const language = $('asrLanguage').value, context = $('asrContext').value, itn = $('asrItn').checked, field = $('asrField').value.trim() || 'file';
      busy = true; cancelled = false; controller = new AbortController(); api.stopPlayback();
      $('runAsrBtn').disabled = true; $('cancelAsrBtn').disabled = false;
      // Avoid a second FFmpeg job while extracting the timeline.
      const controls = ['exportBtn', 'runExportBtn', 'openVideoBtn', 'addVideoBtn', 'addAudioBtn', 'addImageBtn'];
      const disabled = controls.map(id => $(id).disabled); controls.forEach(id => { $(id).disabled = true; });

      let stage = '音频提取 / FFmpeg 资源加载';
      try {
        status('正在按时间轴裁剪、混合并提取音频…');
        await state.waveformQueue; check();
        const wavBlob = await api.renderTimelineAudioWav(); check();
        let cues;
        if (hf) {
          stage = 'Qwen Space 连接';
          status('正在连接 Qwen/Qwen3-ASR-Demo…');
          const transport = await window.WebCutQwen.create({ token, signal: controller.signal, direct: $('asrTransport').value === 'direct' }); check();
          const wav = util.pcmWav(await wavBlob.arrayBuffer()); cues = [];
          const count = Math.ceil(wav.duration / chunkSeconds);
          for (let i = 0; i < count; i++) {
            check(); const start = i * chunkSeconds, end = Math.min(wav.duration, start + chunkSeconds);
            status(`正在识别 ${i + 1}/${count} 段 · ${transport.label}（${start.toFixed(1)}–${end.toFixed(1)} 秒），请等待 Space 排队…`);
            stage = `第 ${i + 1}/${count} 段识别（${transport.label}）`;
            const text = await transport.recognize(util.chunk(wav, start, end), { context, language, enable_itn: itn });
            if (text) cues.push({ start, end, text });
          }
        } else {
          stage = '自定义 API 请求';
          const fd = new FormData(); fd.append(field, wavBlob, 'webcut_timeline.wav');
          const timer = setTimeout(() => controller.abort(), 180000);
          try {
            status('音频已提取，正在请求自定义服务…');
            const response = await fetch(url.href, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd, signal: controller.signal });
            const raw = await response.text();
            if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
            let data; try { data = JSON.parse(raw); } catch { data = { text: raw }; }
            const root = data?.data ?? data?.result ?? data;
            const segments = root?.segments ?? root?.chunks ?? root?.words;
            cues = Array.isArray(segments) && segments.length ? segments.map(s => ({ start: s.start ?? s.start_time ?? s.timestamp?.[0], end: s.end ?? s.end_time ?? s.timestamp?.[1], text: s.text ?? s.word })) : [{ start: 0, end: util.pcmWav(await wavBlob.arrayBuffer()).duration, text: root?.text ?? root?.transcript ?? data?.text ?? '' }];
          } finally { clearTimeout(timer); }
        }
        check();
        if (assets !== state.assets || before !== fingerprint()) throw new Error('识别期间工程或字幕已变化，请重新识别；没有覆盖现有字幕');
        cues = util.validate(cues); api.snapshot(); state.subtitles = cues; refresh();
        status(`识别完成：${cues.length} 条字幕。${hf ? '时间为分段估算，双击字幕块校对后导出 SRT / VTT。' : '可双击字幕块修改并导出。'}`);
      } catch (e) {
        let message = String(e?.message || e);
        if (stage.startsWith('音频提取') && /fetch|network|load failed/i.test(message)) message = 'FFmpeg 资源加载失败，请检查 esm.sh / unpkg.com 是否可访问；尚未向 Qwen 上传音频';
        if (token) message = message.split(token).join('[Key]');
        status(cancelled ? '已取消，现有字幕保持不变。' : `识别失败【${stage}】：${message.slice(0, 500)}。现有字幕保持不变。请检查网络、Token 权限或 Space 状态。`);
      } finally {
        controller = null; busy = false; $('runAsrBtn').disabled = false; $('cancelAsrBtn').disabled = true;
        controls.forEach((id, i) => { $(id).disabled = disabled[i]; });
      }
    };
    refresh();
  }
  if (window.__webCutApi) init(); else window.addEventListener('webcut:ready', init, { once: true });
})();
