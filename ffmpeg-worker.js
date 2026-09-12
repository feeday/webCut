// Same-origin bootstrap for @ffmpeg/ffmpeg 0.12.x.
// The FFmpeg class creates this file as a module Worker. Keeping the Worker
// entry point on the same origin avoids browsers blocking a CDN worker URL.
import 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/worker.min.js';
