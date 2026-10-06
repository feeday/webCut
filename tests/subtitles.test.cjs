const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../subtitle-tools.js');
test('SRT BOM/CRLF, multiline and unsorted cues round-trip', () => {
  const cues = u.parse('\ufeff2\r\n00:00:05,000 --> 00:00:06,200\r\n第二句\r\n\r\n1\r\n00:00:01,234 --> 00:00:02,345\r\n你好\r\nworld\r\n');
  assert.equal(cues[0].text, '你好\nworld');
  assert.deepEqual(u.parse(u.serialize(cues)), cues);
  assert.deepEqual(u.parse(u.serialize(cues, 'vtt')), cues);
});
test('VTT identifiers/settings/notes and minute timestamps', () => {
  assert.deepEqual(u.parse('WEBVTT\n\nNOTE note\nignored\n\ncue-id\n00:01.000 --> 00:02.000 align:start\nHello'), [{ start: 1, end: 2, text: 'Hello' }]);
});
test('invalid, empty, inverted and nonfinite cues fail atomically', () => {
  for (const input of ['', 'not subtitles', '1\n00:00:02,000 --> 00:00:01,000\nx', '1\n00:60:00,000 --> 01:01:01,000\nx']) assert.throws(() => u.parse(input));
  assert.throws(() => u.validate([{ start: NaN, end: 2, text: 'x' }]));
  assert.throws(() => u.validate([{ start: 0, end: 2, text: '' }]));
});
test('timestamp rounding carries seconds and hours', () => {
  assert.match(u.serialize([{ start: 3599.9996, end: 3601, text: 'x' }]), /01:00:00,000 --> 01:00:01,000/);
});
test('PCM WAV cuts preserve samples and last partial chunk', async () => {
  const data = new Uint8Array(16000 * 2 * 3);
  for (let i = 0; i < data.length; i++) data[i] = i % 256;
  const wav = u.pcmWav(await u.chunk({ data, rate: 16000 }, 0, 3).arrayBuffer());
  const tail = u.pcmWav(await u.chunk(wav, 2, 3).arrayBuffer());
  assert.equal(wav.duration, 3); assert.equal(tail.duration, 1);
  assert.deepEqual(tail.data, data.subarray(64000));
  assert.throws(() => u.pcmWav(new ArrayBuffer(2)));
});
test('Space errors are not turned into subtitles', () => {
  assert.equal(u.hfText(['你好', 'Chinese']), '你好');
  assert.throws(() => u.hfText(['Request failed (Status: 429): quota']));
  assert.throws(() => u.hfText({ text: 'wrong shape' }));
});
