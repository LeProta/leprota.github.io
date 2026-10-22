import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { EncryptedStore } from "./store.mjs";

export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const DAYS = 30 * 24 * 60 * 60,
  random = () => randomBytes(32).toString("base64url");
const equal = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
const cookieValue = (req, name) =>
  (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const safeReturn = (value) =>
  typeof value === "string" &&
  value.startsWith("/app/") &&
  !/[\r\n\\]/.test(value) &&
  value.length < 2000
    ? value
    : "/app/";
class Failure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function limited(response, max = 25_000_000) {
  if (Number(response.headers.get("content-length")) > max)
    throw new Failure(502, "Réponse distante trop volumineuse");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > max) throw new Failure(502, "Réponse distante trop volumineuse");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createSessionServer({
  origin,
  ownerEmail,
  publicDirectory,
  key,
  rawStore,
  provider,
  clock = Date.now,
}) {
  const address = new URL(origin);
  if (
    address.protocol !== "https:" ||
    address.username ||
    address.password ||
    address.origin !== origin ||
    !ownerEmail?.includes("@") ||
    !publicDirectory
  )
    throw new Error("Origine HTTPS, propriétaire et dossier public requis");
  const store = new EncryptedStore(rawStore, key, clock),
    locks = new Map();
  let flowWindow = clock(),
    flowStarts = 0;
  async function serial(id, task) {
    const before = locks.get(id) || Promise.resolve();
    const next = before.catch(() => {}).then(task);
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }
  function reply(res, status, body, headers = {}) {
    res.writeHead(status, {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(
      typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body),
    );
  }
  function redirect(res, path, cookies = []) {
    reply(res, 303, "", { Location: path, "Set-Cookie": cookies });
  }
  async function session(req) {
    const id = cookieValue(req, "__Host-jf-session");
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
    const record = await store.read("session", id);
    return record ? { id, ...record } : null;
  }
  async function route(req, res) {
    const url = new URL(req.url, origin),
      path = url.pathname;
    if (req.url.length > 8192) throw new Failure(414, "Adresse trop longue");
    if (path === "/auth/google") {
      if (req.method !== "GET") throw new Failure(405, "Méthode refusée");
      if (clock() - flowWindow >= 60_000) {
        flowWindow = clock();
        flowStarts = 0;
      }
      if (++flowStarts > 10)
        throw new Failure(429, "Patientez avant une nouvelle connexion");
      const state = random(),
        verifier = random(),
        expires = clock() + 600_000;
      await store.put(
        "flow",
        state,
        { verifier, returnTo: safeReturn(url.searchParams.get("return")) },
        expires,
      );
      redirect(res, provider.authorizationURL({ state, verifier }), [
        cookie("__Host-jf-oauth", state, 600),
      ]);
      return;
    }
    if (path === "/auth/google/callback") {
      if (req.method !== "GET") throw new Failure(405, "Méthode refusée");
      const state = url.searchParams.get("state"),
        expected = cookieValue(req, "__Host-jf-oauth");
      if (!/^[A-Za-z0-9_-]{43}$/.test(state || "") || !equal(state, expected))
        throw new Failure(400, "Connexion Google non reconnue");
      const flow = await store.read("flow", state, true);
      if (
        !flow ||
        url.searchParams.has("error") ||
        !url.searchParams.get("code")
      )
        throw new Failure(400, "Connexion Google non accordée ou expirée");
      const tokens = await provider.exchange(
        url.searchParams.get("code"),
        flow.data.verifier,
      );
      if (!tokens.refresh_token || !tokens.scope?.split(" ").includes(SCOPE))
        throw new Failure(403, "Autorisation durable Drive non accordée");
      const owner = await provider.about(tokens);
      if (owner.emailAddress?.toLowerCase() !== ownerEmail.toLowerCase())
        throw new Failure(
          403,
          "Ce compte ne possède pas cet espace de lecture",
        );
      const id = random();
      await store.put("session", id, { tokens }, clock() + DAYS * 1000);
      redirect(res, flow.data.returnTo, [
        cookie("__Host-jf-session", id, DAYS),
        cookie("__Host-jf-oauth", "", 0),
      ]);
      return;
    }
    if (path === "/auth/logout") {
      if (req.method !== "POST") throw new Failure(405, "Méthode refusée");
      if (
        req.headers.origin !== origin ||
        req.headers["x-journal-request"] !== "1"
      )
        throw new Failure(403, "Origine refusée");
      const s = await session(req);
      if (s) await serial(s.id, () => store.remove("session", s.id));
      reply(
        res,
        200,
        { connected: false },
        {
          "Content-Type": "application/json",
          "Set-Cookie": cookie("__Host-jf-session", "", 0),
        },
      );
      return;
    }
    if (path === "/api/session" || path.startsWith("/api/drive/")) {
      if (req.method !== "GET") throw new Failure(405, "Lecture uniquement");
      if (
        req.headers["x-journal-request"] !== "1" ||
        (req.headers.origin && req.headers.origin !== origin)
      )
        throw new Failure(403, "Origine refusée");
      const s = await session(req);
      if (path === "/api/session") {
        if (s)
          await serial(s.id, async () => {
            const fresh = await store.read("session", s.id);
            if (!fresh) throw new Failure(401, "Session expirée");
            await store.put("session", s.id, fresh.data, clock() + DAYS * 1000);
          });
        reply(
          res,
          200,
          { connected: !!s },
          {
            "Content-Type": "application/json",
            ...(s
              ? { "Set-Cookie": cookie("__Host-jf-session", s.id, DAYS) }
              : {}),
          },
        );
        return;
      }
      if (!s) throw new Failure(401, "Reconnectez-vous à Google");
      const resource = path.slice("/api/drive/".length);
      if (!/^(about|files|files\/[A-Za-z0-9_-]{1,200})$/.test(resource))
        throw new Failure(404, "Ressource refusée");
      const allowed = new Set(
        resource === "about"
          ? ["fields"]
          : ["alt", "q", "spaces", "fields", "pageSize", "pageToken"],
      );
      for (const [name, value] of url.searchParams)
        if (!allowed.has(name) || value.length > 3000)
          throw new Failure(400, "Paramètre refusé");
      await serial(s.id, async () => {
        const fresh = await store.read("session", s.id);
        if (!fresh) throw new Failure(401, "Session expirée");
        const result = await provider.drive(
          fresh.data.tokens,
          resource,
          url.searchParams,
        );
        if (result.response.status === 401) {
          await store.remove("session", s.id);
          throw new Failure(401, "Autorisation Google expirée ou révoquée");
        }
        await store.put(
          "session",
          s.id,
          { tokens: result.tokens },
          fresh.expires,
        );
        const body = await limited(result.response);
        const type =
          result.response.headers.get("content-type") ||
          "application/octet-stream";
        reply(res, result.response.status, body, {
          "Content-Type":
            /^(application\/(json|pdf|octet-stream)|image\/(jpeg|png|webp))\b/.test(
              type,
            )
              ? type
              : "application/octet-stream",
        });
      });
      return;
    }
    if (path === "/app/reader-config.json") {
      reply(
        res,
        200,
        { schema: 1, authMode: "server" },
        { "Content-Type": "application/json" },
      );
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      throw new Failure(405, "Méthode refusée");
    const decoded = decodeURIComponent(path);
    if (
      decoded
        .split("/")
        .some(
          (p) =>
            p.startsWith(".") ||
            [
              "session-server",
              "tests",
              "scripts",
              "private",
              "node_modules",
            ].includes(p),
        )
    )
      throw new Failure(404, "Page introuvable");
    const base = await realpath(publicDirectory),
      file = await realpath(
        resolve(base, "." + decoded + (path.endsWith("/") ? "index.html" : "")),
      ).catch(() => null);
    if (!file || !file.startsWith(base + sep))
      throw new Failure(404, "Page introuvable");
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ttf": "font/ttf",
    };
    reply(res, 200, req.method === "HEAD" ? "" : await readFile(file), {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
  }
  return createServer((req, res) =>
    route(req, res).catch((error) => {
      // Pas d'URL de callback, code OAuth, jeton ou corps distant dans les logs.
      if (!res.headersSent)
        reply(
          res,
          error instanceof Failure ? error.status : 503,
          {
            error:
              error instanceof Failure
                ? error.message
                : "Le service de connexion est temporairement indisponible",
          },
          { "Content-Type": "application/json" },
        );
      else res.destroy();
    }),
  );
}

export function googleProvider(
  OAuth2Client,
  { clientId, clientSecret, origin },
) {
  const client = (tokens) => {
    const c = new OAuth2Client(
      clientId,
      clientSecret,
      origin + "/auth/google/callback",
    );
    if (tokens) c.setCredentials(tokens);
    return c;
  };
  return {
    authorizationURL: ({ state, verifier }) =>
      client().generateAuthUrl({
        scope: [SCOPE],
        access_type: "offline",
        prompt: "consent",
        state,
        include_granted_scopes: false,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
    exchange: async (code, codeVerifier) =>
      (await client().getToken({ code, codeVerifier })).tokens,
    about: async (tokens) =>
      (
        await client(tokens).request({
          url: "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
          timeout: 15000,
        })
      ).data.user,
    drive: async (tokens, resource, params) => {
      const c = client(tokens);
      let access;
      try {
        access = (await c.getAccessToken()).token;
      } catch (error) {
        if (error.response?.data?.error === "invalid_grant")
          return { response: new Response("{}", { status: 401 }), tokens };
        throw error;
      }
      if (!access) throw new Error("Autorisation Google non renouvelée");
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/" + resource + "?" + params,
        {
          headers: { Authorization: "Bearer " + access },
          redirect: "error",
          signal: AbortSignal.timeout(25000),
        },
      );
      return { response, tokens: c.credentials };
    },
  };
}
