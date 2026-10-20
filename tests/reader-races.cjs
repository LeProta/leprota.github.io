/* Régressions déterministes : code de transport réel, réponses réseau simulées. */
const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("path");
const { webcrypto, createHash } = require("node:crypto");
const base = process.argv[2] || path.join(__dirname, "../app"),
  raw = (x) => Buffer.from(JSON.stringify(x)),
  hash = (x) => createHash("sha256").update(x).digest("hex");
const a = raw({
  schema: 1,
  id: "article-test",
  title: "Titre",
  deck: "Chapeau",
  section: "Économie",
  paragraphs: ["Texte de test"],
  source: { label: "Source", url: "https://example.org/source" },
  proof_sha256: "a".repeat(64),
});
const pdf = Buffer.from("%PDF-test");
const make = (date, version) => ({
  schema: 1,
  id: "edition-" + date,
  date,
  status: "complete",
  version: version.repeat(64),
  lead_id: "article-test",
  source_pdf_sha256: hash(pdf),
  articles: [{ id: "article-test", file_id: "article-file", sha256: hash(a) }],
  course: null,
  media: {},
  pdf: { file_id: "pdf-file", sha256: hash(pdf) },
});
const old = make("2026-10-18", "b"),
  latest = make("2026-10-19", "c"),
  oldBytes = raw(old),
  newBytes = raw(latest);
const catalog = {
  schema: 1,
  role: "journal_reader_v1",
  editions: [
    {
      ...old,
      file_id: "old-file",
      sha256: hash(oldBytes),
      article_count: 1,
      revision: 1,
    },
    {
      ...latest,
      file_id: "new-file",
      sha256: hash(newBytes),
      article_count: 1,
      revision: 1,
    },
  ],
};
let callback,
  hold = "",
  release,
  started;
const events = new EventTarget(),
  urls = [];
const win = {
  addEventListener: events.addEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
};
const google = {
  accounts: {
    oauth2: {
      initTokenClient(c) {
        callback = c.callback;
        return {
          requestAccessToken() {
            callback({ access_token: "test-token", expires_in: 3600 });
          },
        };
      },
      hasGrantedAllScopes: () => true,
    },
  },
};
win.google = google;
const context = {
  window: win,
  google,
  URL: {
    createObjectURL() {
      urls.push("blob:test");
      return "blob:test";
    },
    revokeObjectURL() {},
  },
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Blob,
  Response,
  AbortController,
  Date,
  crypto: webcrypto,
  CustomEvent: class extends Event {
    constructor(n, o) {
      super(n);
      this.detail = o.detail;
    }
  },
  location: { search: "" },
  setTimeout: () => 1,
  clearTimeout() {},
  localStorage: { getItem: () => null },
  fetch: async (url) => {
    url = String(url);
    if (url === "/app/reader-config.json")
      return new Response(
        raw({ googleClientId: "507961227159-test.apps.googleusercontent.com" }),
      );
    const id = url.split("?")[0].split("/").pop();
    if (id === hold) {
      started();
      await new Promise((r) => (release = r));
    }
    const bytes =
      id === "about"
        ? raw({ user: { permissionId: "test-user" } })
        : id === "files"
          ? raw({ files: [{ id: "catalog-file" }] })
          : id === "catalog-file"
            ? raw(catalog)
            : id === "old-file"
              ? oldBytes
              : id === "new-file"
                ? newBytes
                : id === "article-file"
                  ? a
                  : pdf;
    return new Response(bytes);
  },
};
context.URL = Object.assign(URL, context.URL);
vm.createContext(context);
for (const name of ["reader-contract.js", "drive-reader.js"])
  vm.runInContext(fs.readFileSync(path.join(base, name), "utf8"), context);
const R = win.JournalReader;
async function connect() {
  await new Promise((resolve) => {
    const h = (e) => {
      if (e.detail.status === "ready") {
        events.removeEventListener("reader:state", h);
        resolve();
      }
    };
    events.addEventListener("reader:state", h);
    R.connect();
  });
}
(async () => {
  await R.init();
  await connect();
  let start = new Promise((r) => (started = r));
  hold = "old-file";
  const delayed = R.loadIssue(old.version);
  await start;
  hold = "";
  await R.loadIssue(latest.version);
  release();
  await delayed;
  assert.equal(
      R.snapshot().data.version,
      latest.version,
      "une réponse ancienne ne doit pas remplacer la dernière sélection",
    );
  start = new Promise((r) => (started = r));
  hold = "pdf-file";
  const download = R.pdf();
  await start;
  R.disconnect();
  hold = "";
  release();
  await assert.rejects(download, /session|connexion|interrompu/i);
  assert.equal(urls.length, 0, "aucune URL privée créée après déconnexion");
  await callback({ access_token: "late-token", expires_in: 3600 });
  assert.equal(
    R.snapshot().status,
    "locked",
    "un retour OAuth tardif ne doit pas rouvrir une session déconnectée",
  );
  console.log(
    "Réponses obsolètes, PDF après déconnexion et retour OAuth tardif : OK.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
