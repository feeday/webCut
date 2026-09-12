// Same-origin bootstrap for @ffmpeg/ffmpeg 0.12.x.
//
// webCut uses the ESM build of @ffmpeg/ffmpeg. Its class worker therefore runs
// as a module worker. A module worker cannot import the UMD ffmpeg-core.js that
// app-v03 originally passes to FFmpeg.load(), which causes:
//   Error: failed to import ffmpeg-core.js
//
// Load the normal @ffmpeg worker first, then rewrite only the LOAD message's
// coreURL to the ESM core build. The wasmURL remains the Blob URL prepared by
// app-v03.js, so the 32 MB wasm file is still fetched once by the main page and
// handed to FFmpeg locally.
import 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/worker.min.js';

const ffmpegOnMessage = self.onmessage;
const ESM_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';

self.onmessage = (event) => {
  try {
    const config = event?.data?.data;
    if (config && typeof config === 'object' && 'coreURL' in config) {
      config.coreURL = ESM_CORE_URL;
    }
  } catch (err) {
    console.warn('[webCut] FFmpeg worker core URL rewrite failed:', err);
  }

  return ffmpegOnMessage.call(self, event);
};
