/* Transport réel du lecteur exécuté en VM, API Google simulée, aucun réseau. */
const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict");
const { webcrypto, createHash } = require("node:crypto");
const path = require("path");
const base = process.argv[2] || path.join(__dirname, "../app");
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const raw = (x) => Buffer.from(JSON.stringify(x));
const article = {
  schema: 1,
  id: "article-test",
  title: "Titre de test",
  deck: "Chapeau de test",
  section: "Réglementation",
  paragraphs: ["Paragraphe de test."],
  source: { label: "Source de test", url: "https://example.org/source" },
  proof_sha256: "a".repeat(64),
  illustration: "regulation",
};
const a = raw(article);
const issue = {
  schema: 1,
  id: "edition-2026-10-18",
  date: "2026-10-18",
  status: "complete",
  version: "b".repeat(64),
  lead_id: "article-test",
  source_pdf_sha256: "c".repeat(64),
  articles: [{ id: "article-test", file_id: "article-file", sha256: hash(a) }],
  course: null,
  media: {},
};
const i = raw(issue);
const catalog = {
  schema: 1,
  role: "journal_reader_v1",
  editions: [
    {
      id: issue.id,
      date: issue.date,
      version: issue.version,
      revision: 1,
      article_count: 1,
      file_id: "issue-file",
      sha256: hash(i),
    },
  ],
};
const requests = [],
  stored = new Map(),
  timers = new Map();
let timerId = 0,
  oauthCallback;
let tamper = false,
  deny = false;
const events = new EventTarget();
const win = {
  addEventListener: events.addEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
};
const google = {
  accounts: {
    oauth2: {
      initTokenClient(c) {
        oauthCallback = c.callback;
        return {
          requestAccessToken() {
            return oauthCallback({
              access_token: "test-only-access-token",
              expires_in: 3600,
            });
          },
        };
      },
      hasGrantedAllScopes() {
        return true;
      },
    },
  },
};
const context = {
  window: win,
  google,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Blob,
  Response,
  AbortController,
  Date,
  crypto: webcrypto,
  CustomEvent: class extends Event {
    constructor(name, options) {
      super(name);
      this.detail = options.detail;
    }
  },
  location: { search: "" },
  setTimeout(fn, ms) {
    const id = ++timerId;
    timers.set(id, { fn, ms });
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  localStorage: {
    getItem: (k) => stored.get(k) || null,
    setItem: (k, v) => stored.set(k, v),
  },
  fetch: async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/app/reader-config.json")
      return new Response(
        raw({ googleClientId: "507961227159-test.apps.googleusercontent.com" }),
      );
    assert.equal(options.method, "GET");
    assert(!url.includes("test-only-access-token"));
    assert.equal(
      options.headers.Authorization,
      "Bearer test-only-access-token",
    );
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    if (deny) return new Response("{}", { status: 403 });
    const u = new URL(url);
    if (u.pathname.endsWith("/about"))
      return new Response(raw({ user: { permissionId: "test-user" } }));
    if (u.pathname.endsWith("/files"))
      return new Response(raw({ files: [{ id: "catalogue-file" }] }));
    const id = u.pathname.split("/").pop();
    return new Response(
      id === "catalogue-file"
        ? raw(catalog)
        : id === "issue-file"
          ? i
          : id === "article-file"
            ? tamper
              ? Buffer.from("tampered")
              : a
            : Buffer.from("{}"),
    );
  },
};
win.google = google;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(base, "reader-contract.js"), "utf8"),
  context,
);
vm.runInContext(
  fs.readFileSync(path.join(base, "drive-reader.js"), "utf8"),
  context,
);
(async () => {
  const C = win.ReaderContract,
    R = win.JournalReader;
  assert.throws(() =>
    C.article({
      ...article,
      source: { label: "test", url: "javascript:alert(1)" },
    }),
  );
  assert.throws(() =>
    C.issue({ ...issue, articles: [issue.articles[0], issue.articles[0]] }),
  );
  assert.throws(() =>
    C.catalog({
      ...catalog,
      editions: [{ ...catalog.editions[0], date: "2026-02-31" }],
    }),
  );
  await R.init();
  assert.equal(R.snapshot().status, "locked");
  assert.equal(requests.length, 1);
  await new Promise((resolve) => {
    const handler = (e) => {
      if (["ready", "error", "expired", "locked"].includes(e.detail.status)) {
        events.removeEventListener("reader:state", handler);
        resolve();
      }
    };
    events.addEventListener("reader:state", handler);
    R.connect();
  });
  assert.equal(R.snapshot().status, "ready");
  assert.equal(R.snapshot().data.articles[0].title, "Titre de test");
  assert.equal(R.snapshot().data.leadIndex, 0);
  assert.equal(stored.size, 0, "aucun jeton ou article ne doit être persisté");
  tamper = true;
  await assert.rejects(R.loadIssue(issue.version), /intégrité/);
  assert.equal(R.snapshot().data, null);
  tamper = false;
  await R.loadIssue(issue.version);
  assert.equal(R.snapshot().status, "ready");
  const expiration = [...timers.values()].find((x) => x.ms === 3600000);
  assert(expiration);
  expiration.fn();
  assert.equal(R.snapshot().status, "expired");
  assert.equal(R.snapshot().data, null);
  R.disconnect();
  const before = requests.length;
  await assert.rejects(R.pdf());
  assert.equal(requests.length, before);
  deny = true;
  await new Promise((resolve) => {
    const handler = (e) => {
      if (["ready", "error", "expired", "locked"].includes(e.detail.status)) {
        events.removeEventListener("reader:state", handler);
        resolve();
      }
    };
    events.addEventListener("reader:state", handler);
    R.connect();
  });
  assert.equal(R.snapshot().status, "error");
  assert.equal(R.snapshot().data, null);
  R.disconnect();
  console.log(
    "Lecteur : connexion simulée, GET authentifiés, empreintes, refus 403, expiration et déconnexion : OK.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
