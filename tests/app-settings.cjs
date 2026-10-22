/* Exécuter le gestionnaire de clics réel avant toute connexion Google. */
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const callbacks = {},
  saved = new Map(),
  style = {},
  nodes = new Map();
let selected = "auto",
  connects = 0;
const element = () => ({
  innerHTML: "",
  textContent: "",
  classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
  style: { setProperty: (k, v) => (style[k] = v) },
  addEventListener() {},
  close() {},
  replaceChildren() {},
  focus() {},
});
const doc = {
  getElementById: (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  },
  body: element(),
  documentElement: element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  addEventListener: (n, fn) => (callbacks[n] = fn),
};
const location = new URL("https://journal.example.test/app/#home");
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8"),
  {
    document: doc,
    window: { addEventListener() {} },
    location,
    history: {},
    JournalAppearance: {
      preference: () => selected,
      setPreference: (x) => (selected = x),
    },
    JournalNativeUI: { appearance() {} },
    JournalNavigation: {
      remember() {},
      take: () => ({ url: "/app/#home", scroll: 0 }),
    },
    JournalReader: {
      init() {},
      connect() {
        connects++;
      },
    },
    localStorage: {
      getItem: (k) => saved.get(k) || null,
      setItem: (k, v) => saved.set(k, v),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    URL,
    URLSearchParams,
  },
);
const click = (dataset) =>
  callbacks.click({
    target: {
      closest: () => ({
        dataset,
        hasAttribute: (name) =>
          Object.hasOwn(
            dataset,
            name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
          ),
      }),
    },
  });
click({ theme: "light" });
assert.equal(selected, "light", "Le thème est modifiable sans être connecté");
click({ size: "21" });
assert.equal(saved.get("jf-reader-size"), "21");
assert.equal(style["--reading"], "21px");
click({ go: "settings" });
assert.equal(location.hash, "#settings");
click({ return: "" });
assert.equal(location.hash, "#home", "Retour utilisable avant connexion");
assert.equal(connects, 0);
console.log(
  "Réglages sans connexion : thème, taille et navigation fonctionnels : OK.",
);
