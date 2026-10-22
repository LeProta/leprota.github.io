const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.join(__dirname, "..");
const links = [
  "/index.html",
  "/app/",
  "/notifications.html",
  "/confidentialite.html",
];
for (const name of [
  "index.html",
  "notifications.html",
  "confidentialite.html",
  "lecture.html",
]) {
  const html = fs.readFileSync(path.join(root, name), "utf8");
  assert(
    !/<nav class="nav"/.test(html),
    "La navigation principale ne doit plus être dans l’en-tête",
  );
  const dock = html.match(/<nav class="site-dock"[\s\S]*?<\/nav>/)?.[0];
  assert(dock);
  assert.deepEqual(
    [...dock.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
    links,
  );
  assert.equal((dock.match(/aria-current="page"/g) || []).length, 1);
  assert(html.includes("viewport-fit=cover"));
  assert(html.includes("/shell.css?"));
}
const app = fs.readFileSync(path.join(root, "app/app.js"), "utf8");
assert(!app.includes('<span class="private">'));
assert(
  app.includes('pageRoute() !== "settings"'),
  "Les réglages restent accessibles avant connexion",
);
for (const link of [
  "/index.html",
  "/notifications.html",
  "/confidentialite.html",
])
  assert(app.includes('href="' + link + '"'));
console.log(
  "Enveloppe : navigation basse identique, liens entre pages, réglages accessibles et badge retiré : OK.",
);

for (const [name, markers] of Object.entries({
  "index.html": ["Un journal privé.", 'id="usage"'],
  "notifications.html": [
    'id="subscribe"',
    'id="unsubscribe"',
    'id="notification-title"',
    'id="subscription-output"',
  ],
  "confidentialite.html": [
    'id="perimetre"',
    'id="google"',
    'id="usage"',
    'id="lecture"',
    'id="notifications"',
    'id="site"',
  ],
  "lecture.html": ['id="read-link"', 'id="read-status"'],
})) {
  const html = fs.readFileSync(path.join(root, name), "utf8");
  assert(/<main[\s>]/.test(html) && /<h1[\s>]/.test(html));
  for (const marker of markers)
    assert(html.includes(marker), name + " : contenu conservé " + marker);
}
