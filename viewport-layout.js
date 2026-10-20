/* Masquer le dock lorsque le clavier recouvre la zone de lecture. Aucun contenu privé. */
"use strict";
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  let frame;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      const editable =
        el && (el.matches("input,textarea") || el.isContentEditable);
      const keyboard =
        editable &&
        vv.scale === 1 &&
        document.documentElement.clientHeight - vv.height > 120;
      document.documentElement.classList.toggle("keyboard-open", !!keyboard);
    });
  }
  vv.addEventListener("resize", update, { passive: true });
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  window.addEventListener("pageshow", update);
})();
