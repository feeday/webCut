/* Shared, dependency-free subtitle and PCM-WAV helpers. */
(function (root) {
  'use strict';
  function validate(cues) {
    if (!Array.isArray(cues) || !cues.length) throw new Error('没有可用字幕');
    return cues.map((cue, i) => {
      const start = Number(cue.start), end = Number(cue.end), text = String(cue.text ?? '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text) {
        throw new Error(`第 ${i + 1} 条字幕的时间或文字无效`);
      }
      return { start, end, text };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
  }
  function seconds(value) {
    const m = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
    if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) throw new Error(`无效时间：${value}`);
    return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  }
  function parse(text) {
    const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/), cues = [];
    for (const block of blocks) {
      if (/^(WEBVTT(?:[ \t]|$)|NOTE(?:[ \t\n]|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block)) continue;
      const lines = block.split('\n');
      const i = lines.findIndex(line => line.includes('-->'));
      if (i < 0 || i > 1) throw new Error('字幕格式无效：需要 SRT 或 WebVTT 时间轴');
      const m = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[i].trim());
      if (!m) throw new Error('字幕时间行格式无效');
      cues.push({ start: seconds(m[1]), end: seconds(m[2]), text: lines.slice(i + 1).join('\n') });
    }
    return validate(cues);
  }
  function time(t, separator) {
    const ms = Math.round(t * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
  }
  function serialize(cues, format = 'srt') {
    const vtt = format === 'vtt';
    return (vtt ? 'WEBVTT\n\n' : '') + validate(cues).map((s, i) => `${i + 1}\n${time(s.start, vtt ? '.' : ',')} --> ${time(s.end, vtt ? '.' : ',')}\n${s.text}\n`).join('\n');
  }
  function pcmWav(buffer) {
    const v = new DataView(buffer), tag = p => String.fromCharCode(...new Uint8Array(buffer, p, 4));
    if (v.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('音频不是有效 WAV');
    let fmt, data;
    for (let p = 12; p + 8 <= v.byteLength;) {
      const size = v.getUint32(p + 4, true), start = p + 8;
      if (start + size > v.byteLength) throw new Error('WAV 数据不完整');
      if (tag(p) === 'fmt ' && size >= 16) fmt = { type: v.getUint16(start, true), channels: v.getUint16(start + 2, true), rate: v.getUint32(start + 4, true), align: v.getUint16(start + 12, true), bits: v.getUint16(start + 14, true) };
      if (tag(p) === 'data') data = new Uint8Array(buffer, start, size);
      p = start + size + (size % 2);
    }
    if (!fmt || !data || fmt.type !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || fmt.align !== 2 || !fmt.rate || data.length % 2) throw new Error('需要 16-bit 单声道 PCM WAV');
    return { ...fmt, data, duration: data.length / (fmt.rate * 2) };
  }
  function chunk(wav, start, end) {
    const first = Math.round(start * wav.rate), last = Math.min(Math.round(end * wav.rate), wav.data.length / 2);
    const samples = wav.data.subarray(first * 2, last * 2), buffer = new ArrayBuffer(44 + samples.length), v = new DataView(buffer);
    const tag = (p, s) => [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
    tag(0, 'RIFF'); v.setUint32(4, 36 + samples.length, true); tag(8, 'WAVE'); tag(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, wav.rate, true); v.setUint32(28, wav.rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, samples.length, true); new Uint8Array(buffer, 44).set(samples);
    return new Blob([buffer], { type: 'audio/wav' });
  }
  function hfText(data) {
    const text = data?.[0];
    if (typeof text !== 'string') throw new Error('Space 返回了未知格式');
    if (/^(Request failed|Processing error|No text content|Incomplete response|No recognition result|Please upload)/i.test(text)) throw new Error(text.slice(0, 300));
    return text.trim();
  }
  const api = { validate, parse, serialize, pcmWav, chunk, hfText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WebCutSubtitles = api;
})(globalThis);
