/* Parcours réels du script partagé, stockage/DOM simulés, sans compte Google. */
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../navigation.js"),
  "utf8",
);
const saved = new Map();
function page(href, y = 0, blocked = false) {
  const location = new URL(href),
    callbacks = {};
  const window = {
    addEventListener: (n, f) => (callbacks[n] = f),
    scrollTo: (_, v) => (callbacks.scroll = v),
  };
  const context = {
    URL,
    location,
    scrollY: y,
    window,
    requestAnimationFrame: (f) => f(),
    sessionStorage: {
      getItem: (k) => {
        if (blocked) throw Error();
        return saved.get(k) || null;
      },
      setItem: (k, v) => {
        if (blocked) throw Error();
        saved.set(k, v);
      },
      removeItem: (k) => saved.delete(k),
    },
    document: { addEventListener: (n, f) => (callbacks[n] = f) },
  };
  vm.runInNewContext(source, context);
  return { api: window.JournalNavigation, location, callbacks };
}
let p = page("https://journal.test/app/#archives", 450);
p.api.remember("#settings");
p = page("https://journal.test/app/#settings", 120);
p.api.remember("/notifications.html");
p = page("https://journal.test/notifications.html");
assert.equal(p.api.take("/app/#settings").url, "/app/#settings");
p = page("https://journal.test/app/#settings");
let target = p.api.take("/app/#home");
assert.equal(target.url, "/app/#archives");
assert.equal(target.scroll, 450);
assert.equal(
  p.api.take("/app/#home").url,
  "/app/#home",
  "Un retour consommé ne forme pas de boucle",
);
p = page("https://journal.test/app/?edition=abc#home", 900);
p.api.remember("#article/test");
p = page("https://journal.test/app/?edition=abc#article/test");
assert.equal(p.api.take("/app/#home").scroll, 900);
p.api.remember("https://evil.test/notifications.html");
assert(!saved.get("jf-navigation-returns").includes("evil.test"));
p = page("https://journal.test/lecture.html#url=SECRET");
p.api.remember("/confidentialite.html");
assert(!saved.get("jf-navigation-returns").includes("SECRET"));
p = page("https://journal.test/app/#home", 15, true);
p.api.remember("#settings");
p.location.hash = "settings";
assert.equal(
  p.api.take("/app/#home").scroll,
  15,
  "Retour conservé en mémoire si stockage bloqué",
);
const app = fs.readFileSync(
  require("node:path").join(__dirname, "../app/app.js"),
  "utf8",
);
const settings = app.slice(
  app.indexOf("function settings()"),
  app.indexOf("function lockedView"),
);
assert(
  !settings.includes("navigation("),
  "Les réglages ne gardent pas de navigation basse",
);
assert(
  !app.includes('class="reading-close"'),
  "Fermeture basse remplacée par retour en haut",
);
assert(
  app.includes('go(url.hash.slice(1) || "home", false)'),
  "Un retour ne crée pas un retour inverse",
);
console.log(
  "Retours : réglage spécifique → réglages → écran initial, article, position et repli sans stockage : OK.",
);
