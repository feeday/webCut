(() => {
  'use strict';

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !AudioCtx.prototype?.decodeAudioData) return;

  const nativeDecode = AudioCtx.prototype.decodeAudioData;
  let ffmpegPromise = null;
  let queue = Promise.resolve();

  async function getWaveFFmpeg() {
    if (ffmpegPromise) return ffmpegPromise;
    ffmpegPromise = (async () => {
      const ffmpegMod = await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15');
      const utilMod = await import('https://esm.sh/@ffmpeg/util@0.12.2');
      const ff = new ffmpegMod.FFmpeg();
      const workerBootstrap = 'import "https://esm.sh/@ffmpeg/ffmpeg@0.12.15/es2022/worker.js";';
      const classWorkerURL = URL.createObjectURL(new Blob([workerBootstrap], { type: 'text/javascript' }));
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
      try {
        await ff.load({
          classWorkerURL,
          coreURL: await utilMod.toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await utilMod.toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
        });
      } finally {
        setTimeout(() => URL.revokeObjectURL(classWorkerURL), 1000);
      }
      return ff;
    })();
    return ffmpegPromise;
  }

  async function decodeViaFFmpeg(ctx, sourceBuffer) {
    // Serialize fallback jobs because all jobs share the same FFmpeg virtual FS names.
    const run = async () => {
      const ff = await getWaveFFmpeg();
      const input = 'wave_input.bin';
      const output = 'wave_output.wav';
      try { await ff.deleteFile(input); } catch {}
      try { await ff.deleteFile(output); } catch {}

      await ff.writeFile(input, new Uint8Array(sourceBuffer));
      const code = await ff.exec([
        '-hide_banner', '-loglevel', 'error',
        '-i', input,
        '-vn', '-ac', '1', '-ar', '16000',
        '-c:a', 'pcm_s16le',
        output
      ]);
      if (code !== 0) throw new Error(`FFmpeg audio extraction failed (${code})`);

      const wav = await ff.readFile(output);
      const wavBuffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
      return await nativeDecode.call(ctx, wavBuffer);
    };

    const task = queue.then(run, run);
    queue = task.catch(() => {});
    return task;
  }

  AudioCtx.prototype.decodeAudioData = function patchedDecodeAudioData(audioData, successCallback, errorCallback) {
    const ctx = this;
    const originalCopy = audioData.slice ? audioData.slice(0) : audioData;

    const promise = (async () => {
      try {
        // Native decoding remains the fast path for WAV/MP3/M4A and supported MP4 containers.
        return await nativeDecode.call(ctx, audioData);
      } catch (nativeError) {
        console.info('[webCut] Native audio decode failed; using FFmpeg waveform fallback.', nativeError);
        return await decodeViaFFmpeg(ctx, originalCopy);
      }
    })();

    if (typeof successCallback === 'function' || typeof errorCallback === 'function') {
      promise.then(
        value => { if (typeof successCallback === 'function') successCallback(value); },
        error => { if (typeof errorCallback === 'function') errorCallback(error); }
      );
    }
    return promise;
  };
})();
