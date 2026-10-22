/* Retours internes uniquement : aucune donnée de compte ni d’article conservée. */
(() => {
  "use strict";
  const key = "jf-navigation-returns";
  const pendingKey = "jf-navigation-scroll";
  let memory = {};
  function safe(value) {
    try {
      const u = new URL(value, location.href);
      if (
        u.origin !== location.origin ||
        ![
          "/",
          "/index.html",
          "/notifications.html",
          "/confidentialite.html",
          "/lecture.html",
          "/app/",
          "/app/index.html",
        ].includes(u.pathname)
      )
        return null;
      // Les fragments de notifications peuvent contenir un lien privé : ne jamais les mémoriser.
      if (u.pathname === "/lecture.html") u.hash = "";
      return u;
    } catch {
      return null;
    }
  }
  const id = (u) => u.pathname + (u.pathname.startsWith("/app/") ? u.hash : "");
  function entries() {
    try {
      memory = JSON.parse(sessionStorage.getItem(key) || "{}");
    } catch {
      /* Le parcours reste disponible en mémoire si le stockage est bloqué. */
    }
    if (!memory || typeof memory !== "object" || Array.isArray(memory))
      memory = {};
    return memory;
  }
  function write(value) {
    memory = value;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
  function remember(target) {
    const to = safe(target),
      from = safe(location.href);
    if (!to || !from || id(to) === id(from)) return;
    const data = entries();
    data[id(to)] = {
      url: from.pathname + from.search + from.hash,
      scroll: Math.max(0, scrollY || 0),
    };
    write(Object.fromEntries(Object.entries(data).slice(-30)));
  }
  function take(fallback) {
    const data = entries(),
      current = safe(location.href);
    const entry = current && data[id(current)];
    if (current) delete data[id(current)];
    write(data);
    const url =
      safe(entry?.url) ||
      safe(fallback) ||
      new URL("/app/#home", location.origin);
    return {
      url: url.pathname + url.search + url.hash,
      scroll: Number.isFinite(entry?.scroll) ? Math.max(0, entry.scroll) : 0,
    };
  }
  function leave(target) {
    const url = safe(target.url);
    if (!url) return;
    try {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({ ...target, url: url.href }),
      );
    } catch {}
    location.replace(url.href);
  }
  document.addEventListener("click", (event) => {
    const a = event.target.closest("a[href]");
    if (
      !a ||
      event.defaultPrevented ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      a.target ||
      a.hasAttribute("download")
    )
      return;
    if (a.hasAttribute("data-page-back")) {
      event.preventDefault();
      leave(take(a.getAttribute("href")));
      return;
    }
    const target = safe(a.href);
    if (
      target &&
      (["/index.html", "/notifications.html", "/confidentialite.html"].includes(
        target.pathname,
      ) ||
        target.hash === "#settings")
    )
      remember(target.href);
  });
  window.addEventListener("pageshow", () => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (!pending || pending.url !== location.href) return;
      sessionStorage.removeItem(pendingKey);
      requestAnimationFrame(() =>
        window.scrollTo(0, Math.max(0, Number(pending.scroll) || 0)),
      );
    } catch {}
  });
  window.JournalNavigation = Object.freeze({ remember, take, leave });
})();
