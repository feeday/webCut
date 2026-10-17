(() => {
  'use strict';
  const ad = document.getElementById('webcutEmptyAd');
  const slot = ad?.querySelector('.adsbygoogle');
  if (!ad || !slot) return;

  let requested = false;
  const hasMedia = () => {
    const state = window.__webCutState;
    if (state && ['videos', 'images', 'audios'].some(key => state[key]?.length > 0)) return true;
    return !!document.querySelector('#timelineInner .tl-clip');
  };

  function sync() {
    const filled = hasMedia();
    document.body.classList.toggle('webcut-has-media', filled);
    ad.hidden = filled;
    ad.setAttribute('aria-hidden', String(filled));
    if (!filled) requestAd();
  }

  function requestAd() {
    if (requested || ad.hidden || slot.getAttribute('data-adsbygoogle-status')) return;
    if (slot.getBoundingClientRect().width < 250 || slot.getBoundingClientRect().height < 50) return;
    requested = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      requested = false;
      console.warn('AdSense initialization failed:', error);
    }
  }

  function start() {
    sync();
    const timeline = document.getElementById('timelineInner');
    if (timeline) new MutationObserver(sync).observe(timeline, { childList: true, subtree: true });
    const empty = document.getElementById('emptyPreview');
    if (empty) new MutationObserver(sync).observe(empty, { attributes: true, attributeFilter: ['class'] });
    for (const id of ['mainVideoInput', 'extraVideoInput', 'imageInput', 'audioInput']) {
      document.getElementById(id)?.addEventListener('change', () => {
        queueMicrotask(sync);
        setTimeout(sync, 200);
      });
    }
    window.addEventListener('webcut:ready', sync);
    window.addEventListener('resize', sync);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (!ad.hidden) requestAd(); }).observe(ad);
    setTimeout(sync, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
