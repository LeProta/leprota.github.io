/* Préférence d’apparence commune au lecteur et aux pages publiques. */
"use strict";
(() => {
  const media = matchMedia("(prefers-color-scheme: light)");
  const allowed = ["dark", "light", "auto"];
  let preference = "auto";
  try {
    const saved = JSON.parse(localStorage.getItem("jf-reader-theme"));
    if (allowed.includes(saved)) preference = saved;
  } catch {
    /* Les préférences restent facultatives. */
  }
  function apply() {
    const light =
      preference === "light" || (preference === "auto" && media.matches);
    document.body.classList.toggle("light", light);
    document.documentElement.style.colorScheme = light ? "light" : "dark";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = light ? "#fafbfc" : "#06080b";
    window.dispatchEvent(
      new CustomEvent("appearance:change", { detail: { light } }),
    );
  }
  function setPreference(value) {
    if (!allowed.includes(value)) return;
    preference = value;
    try {
      localStorage.setItem("jf-reader-theme", JSON.stringify(value));
    } catch {}
    apply();
  }
  media.addEventListener("change", apply);
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem("jf-reader-theme"));
      if (allowed.includes(saved)) preference = saved;
    } catch {}
    apply();
  }
  window.addEventListener("pageshow", restore);
  window.addEventListener("storage", (event) => {
    if (event.key === "jf-reader-theme") restore();
  });
  window.JournalAppearance = Object.freeze({
    preference: () => preference,
    setPreference,
  });
  apply();
})();
