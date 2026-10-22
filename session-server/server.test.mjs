import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import {
  createSessionServer,
  SCOPE,
  limited,
  googleProvider,
} from "./server.mjs";
import { EncryptedStore } from "./store.mjs";

class MemoryStore {
  rows = new Map();
  async get(k) {
    return this.rows.get(k) || null;
  }
  async set(k, v) {
    this.rows.set(k, v);
  }
  async delete(k) {
    this.rows.delete(k);
  }
  async take(k) {
    const v = this.rows.get(k) || null;
    this.rows.delete(k);
    return v;
  }
}
const origin = "https://journal.example.test",
  owner = "owner@example.test";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "journal-session-"));
  await mkdir(join(dir, "app"));
  await writeFile(join(dir, "app", "index.html"), "<h1>Journal de test</h1>");
  let time = Date.now(),
    driveStatus = 200,
    email = owner,
    scope = SCOPE,
    exchanges = 0;
  const rawStore = new MemoryStore(),
    key = randomBytes(32);
  const provider = {
    authorizationURL: ({ state }) =>
      "https://accounts.google.com/o/oauth2/v2/auth?state=" + state,
    exchange: async () => {
      exchanges++;
      return {
        refresh_token: "private-refresh-test",
        access_token: "private-access-test",
        scope,
      };
    },
    about: async () => ({ emailAddress: email }),
    drive: async (tokens) => ({
      tokens: { ...tokens, access_token: "renewed-private-access" },
      response: new Response('{"ok":true}', {
        status: driveStatus,
        headers: { "content-type": "application/json" },
      }),
    }),
  };
  const options = {
    origin,
    ownerEmail: owner,
    publicDirectory: dir,
    key,
    rawStore,
    provider,
    clock: () => time,
  };
  const servers = [];
  async function start() {
    const server = createSessionServer(options);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    servers.push(server);
    return "http://127.0.0.1:" + server.address().port;
  }
  const base = await start();
  const request = (path, opts = {}) =>
    fetch(base + path, {
      redirect: "manual",
      ...opts,
      headers: { "X-Journal-Request": "1", ...(opts.headers || {}) },
    });
  async function begin(returnTo = "/app/#courses") {
    const r = await request(
      "/auth/google?return=" + encodeURIComponent(returnTo),
    );
    const flowCookie = r.headers.getSetCookie()[0].split(";")[0],
      state = new URL(r.headers.get("location")).searchParams.get("state");
    return { flowCookie, state };
  }
  async function login() {
    const f = await begin();
    const r = await request(
      "/auth/google/callback?state=" + f.state + "&code=test-code",
      { headers: { Cookie: f.flowCookie } },
    );
    assert.equal(r.status, 303);
    return r.headers.getSetCookie()[0].split(";")[0];
  }
  t.after(async () => {
    await Promise.all(
      servers.map((s) => new Promise((resolve) => s.close(resolve))),
    );
    await rm(dir, { recursive: true, force: true });
  });
  return {
    request,
    login,
    begin,
    rawStore,
    key,
    start,
    base,
    options,
    setTime: (x) => (time += x),
    setEmail: (x) => (email = x),
    setScope: (x) => (scope = x),
    setDriveStatus: (x) => (driveStatus = x),
    exchanges: () => exchanges,
  };
}

test("cookie durable, données chiffrées, reprise dans un nouveau processus logique et déconnexion", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  const status = await f.request("/api/session", {
    headers: { Cookie: cookie },
  });
  assert.deepEqual(await status.json(), { connected: true });
  assert.match(
    status.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Lax/,
  );
  assert.match(status.headers.get("set-cookie"), /Max-Age=2592000/);
  const stored = JSON.stringify([...f.rawStore.rows]);
  assert(!stored.includes("private-refresh-test"));
  assert(!stored.includes(cookie.split("=")[1]));
  const reopened = await f.start();
  const resumed = await fetch(reopened + "/api/session", {
    headers: { "X-Journal-Request": "1", Cookie: cookie },
  });
  assert.equal((await resumed.json()).connected, true);
  assert.equal(
    (
      await f.request("/api/drive/files/test?alt=media", {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request("/auth/logout", {
        method: "POST",
        headers: { Cookie: cookie, Origin: origin },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request("/api/session", { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal(
    (
      await (
        await f.request("/api/session", { headers: { Cookie: cookie } })
      ).json()
    ).connected,
    false,
  );
  assert.equal(
    (await f.request("/api/drive/files/test", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});

test("état OAuth lié au cookie et consommé une seule fois", async (t) => {
  const f = await fixture(t),
    flow = await f.begin("//untrusted.example");
  assert.equal(
    (
      await f.request(
        "/auth/google/callback?state=" + flow.state + "&code=test",
      )
    ).status,
    400,
  );
  assert.equal(f.exchanges(), 0);
  const r = await f.request(
    "/auth/google/callback?state=" + flow.state + "&code=test",
    { headers: { Cookie: flow.flowCookie } },
  );
  assert.equal(r.headers.get("location"), "/app/");
  assert.equal(
    (
      await f.request(
        "/auth/google/callback?state=" + flow.state + "&code=test",
        { headers: { Cookie: flow.flowCookie } },
      )
    ).status,
    400,
  );
  assert.equal(f.exchanges(), 1);
});

test("refus des mauvais comptes et de permissions incomplètes", async (t) => {
  const f = await fixture(t);
  for (const variant of ["owner", "scope"]) {
    f.setEmail(variant === "owner" ? "other@example.test" : owner);
    f.setScope(variant === "scope" ? "openid" : SCOPE);
    const flow = await f.begin();
    const r = await f.request(
      "/auth/google/callback?state=" + flow.state + "&code=test",
      { headers: { Cookie: flow.flowCookie } },
    );
    assert.equal(r.status, 403);
    assert(!r.headers.get("set-cookie"));
  }
});

test("expiration des flux et sessions, absence de secret dans les réponses", async (t) => {
  const f = await fixture(t),
    flow = await f.begin();
  f.setTime(601000);
  assert.equal(
    (
      await f.request(
        "/auth/google/callback?state=" + flow.state + "&code=test",
        { headers: { Cookie: flow.flowCookie } },
      )
    ).status,
    400,
  );
  const cookie = await f.login();
  f.setTime(31 * 86400000);
  const response = await f.request("/api/drive/files/test", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 401);
  assert(!(await response.text()).includes("private"));
});

test("CSRF, méthodes d’écriture et chemins internes refusés", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  assert.equal(
    (
      await f.request("/auth/logout", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(f.base + "/api/session")).status, 403);
  assert.equal(
    (
      await f.request("/api/drive/files/test", {
        method: "DELETE",
        headers: { Cookie: cookie },
      })
    ).status,
    405,
  );
  assert.equal(
    (await f.request("/api/drive/permissions", { headers: { Cookie: cookie } }))
      .status,
    404,
  );
  for (const path of [
    "/session-server/start.mjs",
    "/.env",
    "/private/token.json",
    "/node_modules/test",
  ])
    assert.equal((await f.request(path)).status, 404);
  assert.equal((await f.request("/app/")).status, 200);
  const config = await (await f.request("/app/reader-config.json")).json();
  assert.deepEqual(config, { schema: 1, authMode: "server" });
});

test("révocation Google ferme la session", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  f.setDriveStatus(401);
  assert.equal(
    (await f.request("/api/drive/files/test", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal(
    (
      await (
        await f.request("/api/session", { headers: { Cookie: cookie } })
      ).json()
    ).connected,
    false,
  );
});

test("intégrité du chiffrement et limite des réponses", async () => {
  const raw = new MemoryStore(),
    key = randomBytes(32),
    store = new EncryptedStore(raw, key);
  await store.put(
    "session",
    "opaque",
    { token: "a-secret" },
    Date.now() + 10000,
  );
  const k = [...raw.rows.keys()][0],
    record = raw.rows.get(k);
  record.encrypted = Buffer.from("tampered").toString("base64");
  await assert.rejects(store.read("session", "opaque"));
  await assert.rejects(limited(new Response("too long"), 2));
  await assert.rejects(
    limited(new Response("x", { headers: { "content-length": "100" } }), 10),
  );
});

test("le fournisseur applique PKCE et garde les jetons sur le serveur", async () => {
  let config;
  class OAuth {
    setCredentials(t) {
      this.credentials = t;
    }
    generateAuthUrl(x) {
      config = x;
      return "https://accounts.google.com/";
    }
    async getAccessToken() {
      throw { response: { data: { error: "invalid_grant" } } };
    }
  }
  const p = googleProvider(OAuth, {
    clientId: "public-client",
    clientSecret: "private-secret",
    origin,
  });
  p.authorizationURL({ state: "random", verifier: "random-verifier" });
  assert.equal(config.code_challenge_method, "S256");
  assert.equal(config.access_type, "offline");
  assert.deepEqual(config.scope, [SCOPE]);
  assert(!JSON.stringify(config).includes("private-secret"));
  assert.equal(
    (await p.drive({ refresh_token: "x" }, "files", new URLSearchParams()))
      .response.status,
    401,
  );
});
