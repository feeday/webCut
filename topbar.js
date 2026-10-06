(() => {
  'use strict';
  const menu = document.getElementById('importMenu');
  if (!menu) return;
  menu.addEventListener('click', event => {
    if (event.target.closest('button:not(:disabled)')) menu.open = false;
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    // Keep native summary/button keyboard actions from triggering timeline shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault(); menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
})();
