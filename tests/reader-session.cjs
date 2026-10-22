/* Le transport du lecteur est réel ; le service de session est simulé. */
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { webcrypto, createHash } = require("node:crypto");
const raw = (x) => Buffer.from(JSON.stringify(x)),
  hash = (x) => createHash("sha256").update(x).digest("hex");
const article = raw({
  schema: 1,
  id: "test",
  title: "Titre de test",
  deck: "Chapeau de test",
  section: "Économie",
  paragraphs: ["Texte de test."],
  source: { label: "Source", url: "https://example.org/source" },
  proof_sha256: "a".repeat(64),
});
const issue = {
  schema: 1,
  id: "edition-2026-10-18",
  date: "2026-10-18",
  status: "complete",
  version: "b".repeat(64),
  lead_id: "test",
  source_pdf_sha256: "c".repeat(64),
  articles: [{ id: "test", file_id: "article", sha256: hash(article) }],
  media: {},
  course: null,
};
const issueBytes = raw(issue),
  catalog = raw({
    schema: 1,
    role: "journal_reader_v1",
    editions: [
      {
        id: issue.id,
        date: issue.date,
        version: issue.version,
        revision: 1,
        article_count: 1,
        file_id: "issue",
        sha256: hash(issueBytes),
      },
    ],
  });
const storage = new Map();
let active = true,
  logoutFailure = false,
  sessionDelay = null,
  releaseSession,
  startedSession;
function tab() {
  const requests = [],
    events = new EventTarget(),
    w = {
      addEventListener: events.addEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    };
  const context = {
    window: w,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    Blob,
    Response,
    AbortController,
    crypto: webcrypto,
    Date,
    CustomEvent: class extends Event {
      constructor(n, o) {
        super(n);
        this.detail = o.detail;
      }
    },
    location: {
      href: "https://journal.example.test/app/#courses",
      pathname: "/app/",
      search: "",
      hash: "#courses",
      assign: (x) => requests.push({ redirect: x }),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/app/reader-config.json")
        return new Response(raw({ schema: 1, authMode: "server" }));
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.headers["X-Journal-Request"], "1");
      assert(!options.headers.Authorization);
      if (url === "/auth/logout") {
        assert.equal(options.method, "POST");
        if (logoutFailure) return new Response("{}", { status: 503 });
        active = false;
        return new Response('{"connected":false}');
      }
      if (url === "/api/session") {
        const initial = active;
        if (sessionDelay) {
          startedSession();
          await new Promise((r) => (releaseSession = r));
        }
        return new Response(raw({ connected: initial }));
      }
      assert.equal(new URL(url).origin, "https://journal.example.test");
      assert.equal(options.method, "GET");
      const id = new URL(url).pathname.split("/").pop();
      return new Response(
        id === "about"
          ? raw({ user: { permissionId: "owner-id" } })
          : id === "files"
            ? raw({ files: [{ id: "catalog" }] })
            : id === "catalog"
              ? catalog
              : id === "issue"
                ? issueBytes
                : article,
      );
    },
  };
  vm.createContext(context);
  for (const name of ["reader-contract.js", "drive-reader.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../app", name), "utf8"),
      context,
    );
  return { R: w.JournalReader, requests };
}
(async () => {
  let a = tab();
  await a.R.init();
  assert.equal(a.R.snapshot().status, "ready");
  assert.equal(a.R.sessionMode(), "server");
  assert.equal(
    storage.size,
    0,
    "Aucun jeton ou contenu ne doit être stocké par le lecteur",
  );
  const b = tab();
  await b.R.init();
  assert.equal(
    b.R.snapshot().status,
    "ready",
    "Réouverture avec session existante sans passage par Google",
  );
  assert(!b.requests.some((r) => r.redirect));
  await b.R.disconnect();
  assert.equal(b.R.snapshot().data, null);
  assert.equal(active, false);
  assert.equal(storage.size, 0);
  const c = tab();
  await c.R.init();
  assert.equal(c.R.snapshot().status, "locked");
  c.R.connect();
  assert.match(c.requests.at(-1).redirect, /^\/auth\/google\?return=/);
  active = true;
  logoutFailure = true;
  a = tab();
  await a.R.init();
  await a.R.disconnect();
  assert(a.R.snapshot().logoutPending);
  assert.equal(storage.get("jf-reader-logout-pending"), "true");
  const blocked = tab();
  await blocked.R.init();
  assert.equal(blocked.R.snapshot().status, "locked");
  assert(!blocked.requests.some((r) => String(r.url).includes("/api/drive/")));
  logoutFailure = false;
  await blocked.R.disconnect();
  assert.equal(storage.size, 0);
  active = true;
  sessionDelay = true;
  const delayed = tab();
  let started = new Promise((r) => (startedSession = r));
  const pending = delayed.R.init();
  await started;
  await delayed.R.disconnect();
  releaseSession();
  await pending;
  assert.equal(
    delayed.R.snapshot().status,
    "locked",
    "Une réponse de session tardive ne reconnecte pas après la déconnexion",
  );
  console.log(
    "Session serveur : réouverture, GET par cookie, déconnexion hors ligne et réponse tardive : OK.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
