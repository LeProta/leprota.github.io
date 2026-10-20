"use strict";
(() => {
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3/";
  const C = window.ReaderContract;
  let awaitingOAuth = false;
  let token = "",
    expires = 0,
    expiryTimer,
    client,
    config = {},
    epoch = 0,
    state = { status: "loading", message: "Chargement de la connexion…" };
  let entries = [],
    catalogId = "",
    userKey = "",
    issueData = null,
    articles = [];
  const active = new Set(),
    blobs = new Set();
  const validClient = (id) =>
    typeof id === "string" &&
    /^507961227159-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id);
  function emit(next) {
    state = { ...state, ...next };
    window.dispatchEvent(new CustomEvent("reader:state", { detail: state }));
  }
  function clear() {
    epoch++;
    token = "";
    expires = 0;
    clearTimeout(expiryTimer);
    for (const c of active) c.abort();
    active.clear();
    for (const u of blobs) URL.revokeObjectURL(u);
    blobs.clear();
    entries = [];
    catalogId = "";
    userKey = "";
    issueData = null;
    articles = [];
  }
  function expire() {
    clear();
    emit({
      status: "expired",
      message:
        "Votre session Google a expiré. Reconnectez-vous pour retrouver vos éditions.",
      data: null,
      editions: [],
      userKey: "",
    });
  }
  async function bytes(response, limit) {
    if (!response.ok) {
      if (response.status === 401) {
        expire();
        throw new Error("Votre connexion Google doit être renouvelée.");
      }
      throw new Error(
        response.status === 403
          ? "Google refuse l’accès à ce fichier. Vérifiez le compte utilisé."
          : "Le fichier demandé est indisponible.",
      );
    }
    const length = Number(response.headers.get("Content-Length") || 0);
    if (length > limit) throw new Error("Fichier trop volumineux.");
    const reader = response.body.getReader(),
      chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Fichier trop volumineux.");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let n = 0;
    for (const chunk of chunks) {
      all.set(chunk, n);
      n += chunk.length;
    }
    return all;
  }
  async function api(path, params = {}, limit = 2000000) {
    if (!token || Date.now() >= expires) {
      expire();
      throw new Error("Reconnectez-vous à Google.");
    }
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
    try {
      return await bytes(
        await fetch(url.href, {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        }),
        limit,
      );
    } catch (e) {
      if (e.name === "AbortError")
        throw new Error(
          "La connexion a été interrompue ou a pris trop de temps.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
      active.delete(controller);
    }
  }
  const parse = (raw) =>
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  async function sha(raw) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  async function file(id, expected, limit = 2000000) {
    if (!C.id(id)) throw new Error("Identifiant de fichier invalide.");
    const raw = await api("files/" + id, { alt: "media" }, limit);
    if (expected && (await sha(raw)) !== expected)
      throw new Error(
        "L’intégrité du fichier ne correspond pas à l’édition publiée.",
      );
    return raw;
  }
  async function loadCatalog(current = epoch) {
    const listed = parse(
      await api("files", {
        q: "trashed = false and appProperties has {key='reader_role' and value='catalogue'} and appProperties has {key='journal_reader' and value='journal_reader_v1'}",
        spaces: "drive",
        fields: "files(id,name),nextPageToken",
        pageSize: 10,
      }),
    );
    if (current !== epoch) return;
    if (
      !Array.isArray(listed.files) ||
      listed.nextPageToken ||
      listed.files.length > 1
    )
      throw new Error(
        "Plusieurs bibliothèques correspondent à cette application. Une vérification est nécessaire.",
      );
    if (!listed.files.length)
      throw new Error(
        "Aucune bibliothèque accessible avec cette autorisation. Vérifiez le compte, le projet Google et les fichiers autorisés.",
      );
    catalogId = listed.files[0].id;
    const catalog = C.catalog(parse(await file(catalogId)));
    if (current !== epoch) return;
    entries = catalog.editions;
    if (!entries.length)
      throw new Error("Aucune édition complète n’est disponible.");
  }
  async function loadIssue(version) {
    const entry =
      entries.find((e) => e.version === version) ||
      (!version ? entries[0] : null);
    if (!entry)
      throw new Error(
        "Cette édition n’est pas disponible dans votre bibliothèque.",
      );
    const current = ++epoch;
    for (const controller of active) controller.abort();
    active.clear();
    issueData = null;
    articles = [];
    for (const u of blobs) URL.revokeObjectURL(u);
    blobs.clear();
    emit({
      status: "loading",
      message: "Ouverture de votre édition…",
      data: null,
    });
    try {
      const issue = C.issue(parse(await file(entry.file_id, entry.sha256)));
      if (current !== epoch) return;
      if (
        issue.version !== entry.version ||
        issue.date !== entry.date ||
        issue.id !== entry.id ||
        issue.articles.length !== entry.article_count
      )
        throw new Error("Le manifeste ne correspond pas au catalogue.");
      const loaded = [];
      // Quatre téléchargements au plus à la fois, même si une édition est volumineuse.
      for (let start = 0; start < issue.articles.length; start += 4) {
        if (current !== epoch) return;
        loaded.push(
          ...(await Promise.all(
            issue.articles.slice(start, start + 4).map(async (ref) => {
              const a = C.article(parse(await file(ref.file_id, ref.sha256)));
              if (a.id !== ref.id) throw new Error("Article incohérent.");
              return a;
            }),
          )),
        );
      }
      const photos = {};
      for (const [key, m] of Object.entries(issue.media)) {
        try {
          const raw = await file(m.file_id, m.sha256, 6000000);
          const signature =
            m.mime === "image/jpeg"
              ? raw[0] === 255 && raw[1] === 216
              : m.mime === "image/png"
                ? raw[0] === 137 && raw[1] === 80
                : raw[0] === 82 && raw[1] === 73;
          if (!signature) throw new Error();
          if (current !== epoch) return;
          const url = URL.createObjectURL(new Blob([raw], { type: m.mime }));
          photos[key] = { ...m, url };
          blobs.add(url);
        } catch {
          photos[key] = null;
        }
      }
      if (current !== epoch) return;
      issueData = issue;
      articles = loaded;
      const data = {
        date: issue.date,
        version: issue.version,
        leadIndex: loaded.findIndex((a) => a.id === issue.lead_id),
        course: issue.course,
        media: photos,
        pdf: issue.pdf,
        articles: loaded.map((a) => ({
          ...a,
          source: a.source.label,
          url: a.source.url,
          minutes: Math.max(
            1,
            Math.round(a.paragraphs.join(" ").split(/\s+/).length / 220),
          ),
        })),
      };
      emit({ status: "ready", message: "", data, editions: entries, userKey });
    } catch (e) {
      if (current !== epoch) return;
      emit({
        status: token ? "error" : "expired",
        message: e.message,
        data: null,
      });
      throw e;
    }
  }
  async function onToken(response) {
    if (!awaitingOAuth) return;
    awaitingOAuth = false;
    if (
      !response ||
      response.error ||
      !response.access_token ||
      !google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)
    ) {
      emit({
        status: "locked",
        message: "L’autorisation Drive n’a pas été accordée.",
        data: null,
      });
      return;
    }
    clear();
    const current = epoch;
    token = response.access_token;
    const seconds = Math.min(
      3600,
      Math.max(1, Number(response.expires_in) || 300),
    );
    expires = Date.now() + seconds * 1000;
    expiryTimer = setTimeout(expire, seconds * 1000);
    emit({
      status: "loading",
      message: "Recherche de vos éditions privées…",
      data: null,
      editions: [],
      userKey: "",
    });
    try {
      const about = parse(await api("about", { fields: "user(permissionId)" }));
      if (current !== epoch) return;
      if (!C.id(about.user?.permissionId))
        throw new Error("Compte Google non identifié.");
      userKey = (
        await sha(new TextEncoder().encode(about.user.permissionId))
      ).slice(0, 24);
      if (current !== epoch) return;
      await loadCatalog(current);
      if (current === epoch) {
        const requested = new URLSearchParams(location.search).get("edition");
        const target = requested
          ? entries.find((e) => e.version === requested || e.date === requested)
          : entries[0];
        if (!target)
          throw new Error(
            "L’édition demandée est introuvable. Ouvrez la bibliothèque pour choisir une autre date.",
          );
        await loadIssue(target.version);
      }
    } catch (e) {
      if (current === epoch)
        emit({
          status: token ? "error" : "expired",
          message: e.message,
          data: null,
        });
    }
  }
  function configureClient() {
    if (!validClient(config.googleClientId)) return false;
    client = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: SCOPE,
      include_granted_scopes: false,
      callback: onToken,
      error_callback: () => {
        awaitingOAuth = false;
        emit({
          status: "locked",
          message:
            "La connexion Google n’a pas abouti. Autorisez la fenêtre de connexion puis réessayez.",
          data: null,
        });
      },
    });
    return true;
  }
  async function ensureGoogle() {
    if (window.google?.accounts?.oauth2) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error("La connexion Google ne peut pas être chargée."));
      document.head.append(script);
    });
  }
  async function init() {
    try {
      const response = await fetch("/app/reader-config.json", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error();
      config = await response.json();
      let local = "";
      try {
        local = localStorage.getItem("jf-reader-google-client") || "";
      } catch {}
      if (!validClient(config.googleClientId) && validClient(local))
        config.googleClientId = local;
      if (!validClient(config.googleClientId)) {
        emit({
          status: "setup",
          message: "La connexion privée est prête à être configurée.",
          data: null,
        });
        return;
      }
      await ensureGoogle();
      configureClient();
      emit({
        status: "locked",
        message:
          "Connectez-vous avec le compte Google qui possède vos journaux.",
        data: null,
      });
    } catch {
      emit({
        status: "error",
        message:
          "La configuration de connexion ne peut pas être chargée. Vérifiez le réseau.",
        data: null,
      });
    }
  }
  async function setClient(value) {
    if (!validClient(value))
      throw new Error(
        "Utilisez l’identifiant public du client Web créé dans le projet du journal.",
      );
    clear();
    config.googleClientId = value;
    try {
      localStorage.setItem("jf-reader-google-client", value);
    } catch {}
    await ensureGoogle();
    configureClient();
    emit({
      status: "locked",
      message:
        "Configuration enregistrée. Vous pouvez vous connecter à Google.",
      data: null,
    });
  }
  function connect() {
    if (!client) {
      emit({
        status: "setup",
        message: "Configurez d’abord la connexion Google.",
        data: null,
      });
      return;
    }
    clear();
    awaitingOAuth = true;
    emit({
      status: "connecting",
      data: null,
      editions: [],
      userKey: "",
      message: "Choisissez votre compte dans la fenêtre Google…",
    });
    client.requestAccessToken({ prompt: "select_account" });
  }
  function disconnect() {
    awaitingOAuth = false;
    clear();
    emit({
      status: "locked",
      message:
        "Vous êtes déconnecté. Aucun article privé n’est conservé dans ce navigateur.",
      data: null,
      userKey: "",
      editions: [],
    });
  }
  async function pdf() {
    if (!issueData?.pdf) throw new Error("Aucun PDF associé.");
    const current = epoch,
      issue = issueData;
    const raw = await file(issue.pdf.file_id, issue.pdf.sha256, 25000000);
    if (current !== epoch || !token)
      throw new Error("Votre session a changé pendant le téléchargement.");
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/pdf" }),
    );
    blobs.add(url);
    return { url, name: "journal-financier-" + issue.date + ".pdf" };
  }
  window.JournalReader = Object.freeze({
    init,
    setClient,
    connect,
    disconnect,
    loadIssue,
    pdf,
    snapshot: () => state,
  });
})();
