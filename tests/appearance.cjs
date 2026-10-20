/* Préférence partagée : stockage local et événements système simulés. */
const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const saved = new Map(),
  handlers = {},
  classes = new Set(),
  meta = {};
const media = {
  matches: false,
  addEventListener: (n, f) => (handlers.media = f),
};
const w = { addEventListener: (n, f) => (handlers[n] = f), dispatchEvent() {} };
const doc = {
  body: {
    classList: { toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)) },
  },
  documentElement: { style: {} },
  querySelector: () => meta,
};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../appearance.js"), "utf8"),
  {
    window: w,
    document: doc,
    matchMedia: () => media,
    localStorage: {
      getItem: (k) => saved.get(k) || null,
      setItem: (k, v) => saved.set(k, v),
    },
    CustomEvent: class {
      constructor(n, o) {
        this.type = n;
        this.detail = o.detail;
      }
    },
  },
);
const api = w.JournalAppearance;
assert.equal(api.preference(), "auto");
assert(!classes.has("light"));
api.setPreference("light");
assert(classes.has("light"));
assert.equal(meta.content, "#fafbfc");
api.setPreference("dark");
assert(!classes.has("light"));
api.setPreference("auto");
media.matches = true;
handlers.media();
assert(classes.has("light"));
api.setPreference("invalid");
assert.equal(api.preference(), "auto");
saved.set("jf-reader-theme", JSON.stringify("dark"));
handlers.pageshow();
assert.equal(api.preference(), "dark");
assert(!classes.has("light"));
saved.set("jf-reader-theme", JSON.stringify("light"));
handlers.storage({ key: "jf-reader-theme" });
assert(classes.has("light"));
console.log(
  "Apparence partagée : défaut, thèmes explicites, système, retour de page et synchronisation : OK.",
);
