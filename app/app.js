"use strict";
let searchIndex = [];
let JOURNAL_DATA = null;
let readerNamespace = "";
let readerPdfBusy = false;
let readerDestination = null;
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const paths = {
  share: "M12 16V3m-4 4 4-4 4 4M5 11v10h14V11",
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  journal: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  book: "M12 6C8 3 4 4 3 5v15c3-2 6-1 9 1m0-15c4-3 8-2 9-1v15c-3-2-6-1-9 1V6",
  archive: "M4 8h16v13H4zM3 3h18v5H3zM10 12h4",
  menu: "M4 5h16M4 12h16M4 19h16",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10 2h4l1 4 4-1 2 3-3 4 3 4-2 3-4-1-1 4h-4l-1-4-4 1-2-3 3-4-3-4 2-3 4 1 1-4",
  back: "m15 4-8 8 8 8",
  next: "m9 4 8 8-8 8",
  bookmark: "M6 3h12v19l-6-5-6 5z",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3m5 3h4",
  type: "M3 20 10 3l7 17M5 15h10m2-6h6m-3 0v11",
  check: "m4 12 5 5L20 6",
  close: "m5 5 14 14M19 5 5 19",
  plus: "M12 4v16M4 12h16",
  minus: "M4 12h16",
  shield: "m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3m-4 10 3 3 5-6",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.journal}"/></svg>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function read(key, fallback) {
  try {
    return (
      JSON.parse(
        localStorage.getItem(
          "jf-reader-" +
            (key === "favorites" ? readerNamespace + "-" : "") +
            key,
        ),
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(
      "jf-reader-" + (key === "favorites" ? readerNamespace + "-" : "") + key,
      JSON.stringify(value),
    );
  } catch {}
}
let favorites = new Set();
let theme = JournalAppearance.preference(),
  size = read("size", 18);
if (!["dark", "light", "auto"].includes(theme)) theme = "auto";
if (![16, 18, 21].includes(size)) size = 18;
let learningSession = null;
let readingReturn = { route: "home", scroll: 0 },
  pendingReturnScroll = null;
const main = document.getElementById("main"),
  header = document.getElementById("header"),
  nav = document.getElementById("navigation");
function markChoice(attribute, selected) {
  document.querySelectorAll(`[${attribute}]`).forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.getAttribute(attribute) === String(selected)),
    );
  });
}
function applyPreferences() {
  theme = JournalAppearance.preference();
  markChoice("data-theme", theme);
  markChoice("data-size", size);
  document.documentElement.style.setProperty("--reading", size + "px");
  JournalNativeUI.appearance(
    document.body.classList.contains("light"),
    document.body.classList.contains("feed-mode") || !JOURNAL_DATA,
  );
}
window.addEventListener("appearance:change", applyPreferences);
applyPreferences();
function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 2300);
}
function go(route, record = true) {
  if (
    record &&
    pageRoute() !== route &&
    (route === "settings" ||
      (route.startsWith("article/") && !pageRoute().startsWith("article/")))
  ) {
    JournalNavigation.remember("#" + route);
  }
  if (location.hash === "#" + route) {
    render();
    window.scrollTo(0, 0);
  } else location.hash = route;
}
function pageRoute() {
  return location.hash.slice(1) || "home";
}
function bookmark(i) {
  const a = JOURNAL_DATA.articles[i];
  return `<button class="bookmark" data-save="${i}" aria-label="${favorites.has(a.id) ? "Retirer des favoris" : "Enregistrer dans les favoris"}" aria-pressed="${favorites.has(a.id)}">${icon("bookmark")}</button>`;
}
function articleMedia(a, css = "story-thumb") {
  const media = a.media_key && JOURNAL_DATA.media[a.media_key];
  const fallback =
    a.illustration === "regulation"
      ? "document.svg"
      : a.illustration === "bank"
        ? "bank.svg"
        : a.illustration === "markets"
          ? "markets.svg"
          : "economy.svg";
  return `<img class="${css}${media ? "" : " rubric-illustration"}" src="${media ? esc(media.url) : "assets/" + fallback}" alt="${media ? esc(media.caption) : "Illustration de rubrique"}" loading="lazy">`;
}
function mediaCaption(a) {
  const m = a.media_key && JOURNAL_DATA.media[a.media_key];
  return m
    ? `<span>Illustration : ${esc(m.caption)} · ${esc(m.author)} / <a href="${esc(m.license_url)}" target="_blank" rel="noreferrer">${esc(m.license)}</a></span>`
    : "Illustration de rubrique · Le Journal Financier";
}
function articleRow(i) {
  const a = JOURNAL_DATA.articles[i],
    thumb = !!a.media_key || i % 2 === 0;
  return `<article class="news-row"><button class="story" data-go="article/${a.id}"><span class="story-copy"><span class="eyebrow">${esc(a.section)}</span><h3>${esc(a.title)}</h3><span class="article-meta">${esc(a.source)} · ${a.minutes} min</span></span>${thumb ? articleMedia(a) : ""}</button>${pageRoute() === "saved" ? bookmark(i) : ""}</article>`;
}
function dateLabel(value = JOURNAL_DATA.date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(value + "T12:00:00Z"));
}
function sectionMatch(a, filter) {
  return (
    filter === "all" ||
    (filter === "Économie" && a.illustration === "economy") ||
    (filter === "Banque" && a.illustration === "bank") ||
    (filter === "Réglementation" && a.illustration === "regulation")
  );
}
function backButton() {
  return `<button class="back-button" data-return aria-label="Retour à l’écran précédent">${icon("back")}<span>Retour</span></button>`;
}
function headings(title, ico, home = false) {
  header.innerHTML = `<div class="top ${home ? "home-top" : ""}">${home ? `<button class="wordmark" data-go="home" aria-label="Accueil du Journal Financier"><span class="monogram">JF</span><span>Le Journal<br><small>Financier</small></span></button>` : `<h1 class="page-heading">${icon(ico)}${esc(title)}</h1>`}<div class="header-actions">${pageRoute() === "settings" ? backButton() : `<button class="round" data-go="settings" aria-label="Ouvrir les réglages">${icon("settings")}</button>`}</div></div>`;
}
function navigation(active) {
  nav.innerHTML = `<nav class="floating" aria-label="Navigation principale"><div class="nav-pill">${[
    ["home", "home", "À la une"],
    ["journal", "journal", "Journal"],
    ["courses", "book", "Cours"],
    ["archives", "archive", "Archives"],
  ]
    .map(
      ([r, i, l]) =>
        `<button class="nav-item" data-go="${r}" ${active === r ? 'aria-current="page"' : ""}>${icon(i)}<span>${l}</span></button>`,
    )
    .join(
      "",
    )}</div><button class="menu-button" data-go="menu" aria-label="Rubriques et recherche" ${active === "menu" ? 'aria-current="page"' : ""}>${icon("search")}</button></nav>`;
}
function credit() {
  return `<p class="credits">Édition privée du ${dateLabel()}.<br>Le Journal Financier · Vos documents restent dans votre Drive.</p>`;
}
function home(filter = "all") {
  headings("", "", true);
  navigation("home");
  const cats = [
    ["all", "À la une"],
    ["Économie", "Économie"],
    ["Banque", "Banque"],
    ["Réglementation", "Réglementation"],
  ];
  header.innerHTML += `<nav class="tabs" aria-label="Rubriques de la une">${cats.map(([v, l]) => `<button class="tab" data-go="home/${encodeURIComponent(v)}" aria-pressed="${filter === v}">${l}</button>`).join("")}</nav>`;
  const lead = JOURNAL_DATA.articles[JOURNAL_DATA.leadIndex],
    indices = JOURNAL_DATA.articles
      .map((_, i) => i)
      .filter((i) => sectionMatch(JOURNAL_DATA.articles[i], filter));
  const rows = indices.filter(
    (i) => filter !== "all" || i !== JOURNAL_DATA.leadIndex,
  );
  const revision = JOURNAL_DATA.course
    ? `<section class="feed-inset"><span class="inset-heading">Le rendez-vous des cours</span><h2>${esc(JOURNAL_DATA.course.title)}</h2><p>Votre fiche et ${JOURNAL_DATA.course.quiz.length} questions corrigées.</p><button class="inset-link" data-go="courses">Ouvrir les cours ${icon("next")}</button></section>`
    : "";
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
  }).format(new Date());
  main.innerHTML = `<div class="edition-line"><span><i class="dot"></i>${JOURNAL_DATA.date === today ? "Votre édition du jour" : "Dernière édition disponible"}</span><span>${dateLabel()}</span></div>${filter === "all" ? `<article class="lead-story"><p class="eyebrow">${esc(lead.section)}</p><button class="headline-button" data-go="article/${lead.id}"><h1 class="headline">${esc(lead.title)}</h1>${articleMedia(lead, "hero-photo")}</button><p class="caption">${mediaCaption(lead)}</p><p class="lead">${esc(lead.deck)}</p></article>` : ""}<div class="edition-feed">${rows.map((i, n) => articleRow(i) + (filter === "all" && n === 1 ? revision : "")).join("")}${!rows.length && filter !== "all" ? '<p class="empty">Aucun article de cette rubrique dans cette édition.</p>' : ""}</div>${credit()}`;
}
function journal() {
  headings("Édition", "journal");
  navigation("journal");
  main.innerHTML = `<div class="pills"><span class="pill active">${dateLabel()}</span><button class="pill" data-go="archives">Autres éditions</button></div><h2 class="section-title">Votre journal <small>${JOURNAL_DATA.articles.length} articles</small></h2><section class="issue-summary"><p class="eyebrow">${dateLabel()}</p><h2>Le Journal Financier</h2><p>Votre édition économique et financière, à lire article par article.</p><button class="blue-button" data-go="article/${JOURNAL_DATA.articles[JOURNAL_DATA.leadIndex].id}">Commencer la lecture ${icon("next")}</button></section><h2 class="section-title">Le sommaire</h2><div class="toc">${JOURNAL_DATA.articles.map((a) => `<button data-go="article/${a.id}">${esc(a.title)}${icon("next")}</button>`).join("")}</div>${JOURNAL_DATA.pdf ? '<div class="actions"><button class="subtle-button" data-download-pdf>Télécharger aussi le PDF</button></div>' : ""}${credit()}`;
}
function article(i) {
  if (!JOURNAL_DATA.articles[i]) return home();
  const a = JOURNAL_DATA.articles[i];
  header.innerHTML = `<div class="top article-top"><span class="reading-label">Le Journal Financier</span>${backButton()}</div><div class="reading-progress" aria-hidden="true"><span id="reading-progress-bar"></span></div>`;
  nav.innerHTML = `<nav class="floating reading-controls" aria-label="Commandes de lecture"><div class="reading-pill">${bookmark(i)}<button data-font="-1" aria-label="Réduire le texte">A−</button><button data-font="1" aria-label="Agrandir le texte">A+</button><button data-share-source="${i}" aria-label="Partager la publication source">${icon("share")}</button></div><button class="reading-summary" data-go="journal" aria-label="Ouvrir le sommaire">${icon("journal")}</button></nav>`;
  main.innerHTML = `<article class="immersive-article"><p class="eyebrow">${esc(a.section)}</p><h1 class="headline">${esc(a.title)}</h1><p class="standfirst">${esc(a.deck)}</p><div class="reading-byline"><strong>Le Journal Financier</strong><span>Édition du ${dateLabel()} · ${a.minutes} min de lecture</span><span>Source : ${esc(a.source)}</span></div><figure class="reading-figure">${articleMedia(a, "hero-photo")}<figcaption>${mediaCaption(a)}</figcaption></figure><div class="article-body">${a.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("")}</div><div id="article-end" class="source-box"><strong>La publication d’origine</strong><p>${esc(a.source)} · Source conservée dans cette édition.</p><a href="${esc(a.url)}" target="_blank" rel="noreferrer">Consulter la source ↗</a></div></article><section class="reading-next"><h2 class="section-title">À lire aussi</h2>${articleRow((i + 1) % JOURNAL_DATA.articles.length)}</section>`;
  updateReadingProgress();
}
function updateReadingProgress() {
  const bar = document.getElementById("reading-progress-bar"),
    end = document.getElementById("article-end");
  if (!bar || !end) return;
  const distance = end.getBoundingClientRect().bottom + scrollY - innerHeight;
  bar.style.width =
    Math.min(
      100,
      Math.max(0, distance <= 0 ? 100 : (scrollY / distance) * 100),
    ) + "%";
}
let readingFrame = 0;
window.addEventListener(
  "scroll",
  () => {
    if (readingFrame) return;
    readingFrame = requestAnimationFrame(() => {
      readingFrame = 0;
      updateReadingProgress();
    });
  },
  { passive: true },
);
function reader() {
  journal();
}
function courses() {
  headings("Cours", "book");
  navigation("courses");
  main.innerHTML =
    JournalLearning.home(JOURNAL_DATA.course, dateLabel(), learningSession) +
    credit();
}
function lesson() {
  if (!JOURNAL_DATA.course) return courses();
  headings("Fiche de cours", "book");
  navigation("courses");
  main.innerHTML = JournalLearning.lesson(JOURNAL_DATA.course);
}

function archives(saved = false) {
  headings(saved ? "Mes favoris" : "Archives", saved ? "bookmark" : "archive");
  navigation(saved ? "menu" : "archives");
  if (saved) {
    const indices = JOURNAL_DATA.articles
      .map((_, i) => i)
      .filter((i) => favorites.has(JOURNAL_DATA.articles[i].id));
    main.innerHTML = `<h2 class="section-title">À retrouver <small>${indices.length} article${indices.length > 1 ? "s" : ""}</small></h2>${indices.length ? indices.map(articleRow).join("") : '<p class="empty">Aucun favori dans cette édition. Vos autres favoris restent associés aux éditions correspondantes.</p>'}`;
    return;
  }
  const entries = JournalReader.snapshot().editions || [];
  main.innerHTML = `<h2 class="section-title">Vos éditions <small>${entries.length} version${entries.length > 1 ? "s" : ""}</small></h2>${entries.map((e) => `<button class="archive-entry" data-load-issue="${e.version}"><span class="archive-art">${icon("journal")}</span><span><h3>${dateLabel(e.date)}</h3><p>${e.article_count} articles · Version ${e.revision}</p><span class="eyebrow">Lire l’édition →</span></span></button>`).join("")}${credit()}`;
}
function menu() {
  headings("Rubriques", "menu");
  navigation("menu");
  main.innerHTML = `<label class="search">${icon("search")}<input id="search" type="search" enterkeyhint="search" autocapitalize="none" spellcheck="false" placeholder="Rechercher un article" aria-label="Rechercher un article"></label><div id="search-results"></div><div id="menu-topics"><h2 class="section-title">Toute l’édition</h2>${[
    ["Économie", "home/Économie"],
    ["Banque et finance", "home/Banque"],
    ["Réglementation", "home/Réglementation"],
    ["Cours et exercices", "courses"],
    ["Mes articles enregistrés", "saved"],
    ["Réglages", "settings"],
  ]
    .map(
      ([label, r]) =>
        `<button class="topic-row" data-go="${r}">${label}${icon("next")}</button>`,
    )
    .join(
      "",
    )}</div><section class="application-links"><h2 class="settings-label">L’application</h2><a class="topic-row" href="/index.html">Présentation ${icon("next")}</a><a class="topic-row" href="/notifications.html">Notifications ${icon("bell")}</a><a class="topic-row" href="/confidentialite.html">Confidentialité ${icon("shield")}</a></section>${credit()}`;
}
function settings() {
  headings("Réglages", "settings");
  nav.innerHTML = "";
  main.innerHTML = `<h2 class="settings-label">Lecture</h2><div class="group"><div class="group-row">Apparence</div><div class="choices settings-choices">${[
    ["dark", "Sombre"],
    ["light", "Clair"],
    ["auto", "Automatique"],
  ]
    .map(
      ([v, l]) =>
        `<button class="choice" data-theme="${v}" aria-pressed="${theme === v}">${l}</button>`,
    )
    .join(
      "",
    )}</div><div class="group-row">Taille du texte</div><div class="choices settings-choices">${[
    [16, "Petite"],
    [18, "Moyenne"],
    [21, "Grande"],
  ]
    .map(
      ([v, l]) =>
        `<button class="choice" data-size="${v}" aria-pressed="${size === v}">${l}</button>`,
    )
    .join(
      "",
    )}</div></div><h2 class="settings-label">Votre application</h2><div class="group"><a class="group-row" href="/index.html">Présentation ${icon("next")}</a><a class="group-row" href="/confidentialite.html">Confidentialité ${icon("shield")}</a><a class="group-row" href="/notifications.html">Gérer les notifications ${icon("next")}</a>${JOURNAL_DATA ? `<button class="group-row" data-go="saved">Mes articles enregistrés ${icon("bookmark")}</button><button class="group-row" data-disconnect>Se déconnecter de Google ${icon("shield")}</button>` : `<button class="group-row" data-connect>Se connecter avec Google ${icon("shield")}</button>`}</div><p class="small-note">${JournalReader.sessionMode?.() === "server" ? "Votre connexion est conservée sur cet appareil par le service de session. Les autorisations Google restent côté serveur. Utilisez Se déconnecter sur un appareil partagé." : "Sur cet hébergement, la connexion Google est temporaire. Une fermeture complète peut demander de rouvrir la connexion. Les autorisations Google restent uniquement en mémoire."} Les préférences d’apparence et les identifiants des favoris restent sur cet appareil.</p><a href="/confidentialite.html">Politique de confidentialité</a>`;
}
function lockedView() {
  const state = JournalReader.snapshot();
  headings("", "", true);
  navigation("");
  document.body.classList.remove("reading-mode", "feed-mode");
  const loading = ["loading", "connecting"].includes(state.status);
  main.innerHTML = `<section class="login-intro"><p class="eyebrow">Votre espace de lecture privé</p><h1>Le journal.<br>À votre rythme.</h1><p>L’actualité économique, vos éditions et vos révisions, réunies dans votre application.</p><div class="connection-card"><span class="connection-icon">${icon("shield")}</span><h2>${loading ? "Ouverture de votre espace…" : "Retrouvez vos journaux"}</h2><p role="status">${esc(state.message || "Connectez-vous à Google pour consulter votre bibliothèque privée.")}</p>${loading ? '<div class="loading-bar" aria-label="Chargement en cours"></div>' : state.status === "setup" ? "" : state.logoutPending ? `<button class="blue-button" data-disconnect>Confirmer la déconnexion</button>` : `<button class="blue-button" data-connect>Se connecter avec Google</button><button class="subtle-button" data-switch-account>Choisir un autre compte</button>`}</div><div class="login-features"><span>${icon("journal")}Articles et éditions</span><span>${icon("archive")}Archives conservées</span><span>${icon("book")}Cours et exercices</span></div>${state.status === "setup" ? `<details class="connection-setup" open><summary>Configurer la connexion Google</summary><p>Une configuration unique est nécessaire pour relier cette application à votre projet Google. Utilisez l’identifiant public du client Web, jamais une clé privée ni un fichier JSON.</p><label for="google-client">Identifiant public du client Web</label><input id="google-client" type="text" spellcheck="false" autocomplete="off" placeholder="…apps.googleusercontent.com"><button class="subtle-button" data-configure-google>Enregistrer la configuration</button><p id="setup-status" role="status"></p></details>` : ""}<p class="small-note">L’autorisation Google concerne les fichiers utilisés avec l’application. Elle inclut leur gestion ; ce lecteur s’en sert uniquement pour les consulter.</p><p class="small-note">Les journaux restent dans votre Drive. L’application n’envoie aucune requête de rédaction IA.</p><a class="small-note" href="/notifications.html">Configurer les notifications</a> · <a class="small-note" href="/confidentialite.html">Confidentialité</a></section>`;
}
function render() {
  JournalNativeUI.appearance(
    document.body.classList.contains("light"),
    pageRoute().startsWith("home") || !JOURNAL_DATA,
  );
  if (!JOURNAL_DATA && pageRoute() !== "settings") return lockedView();
  const [page, arg] = pageRoute().split("/");
  document.body.classList.toggle("feed-mode", page === "home");
  document.body.classList.toggle("reading-mode", page === "article");
  let decoded;
  try {
    decoded = decodeURIComponent(arg || "all");
  } catch {
    decoded = "all";
  }
  switch (page) {
    case "journal":
      journal();
      break;
    case "reader":
      reader();
      break;
    case "article": {
      const i = JOURNAL_DATA.articles.findIndex((a) => a.id === arg);
      if (i < 0) {
        headings("Article indisponible", "journal");
        navigation("home");
        main.innerHTML =
          '<p class="empty">Cet article n’est pas présent dans l’édition ouverte.</p>';
      } else article(i);
      break;
    }
    case "courses":
      courses();
      break;
    case "lesson":
      lesson();
      break;
    case "archives":
      archives();
      break;
    case "saved":
      archives(true);
      break;
    case "menu":
      menu();
      break;
    case "settings":
      settings();
      break;
    default:
      home(decoded);
  }
}
function clearLearning() {
  learningSession = null;
  const dialog = document.getElementById("quiz");
  dialog.close();
  document.getElementById("quiz-content").replaceChildren();
}
function startQuiz(kind) {
  const course = JOURNAL_DATA?.course;
  if (!course) return;
  if (kind === "resume") {
    if (!learningSession || learningSession.done) return;
  } else if (kind === "mistakes") {
    if (!learningSession?.done || !learningSession.mistakes.length) return;
    learningSession = learningSession.retry();
  } else {
    if (!["all", "qcm", "true_false"].includes(kind)) return;
    const questions = course.quiz.filter(
      (q) => kind === "all" || q.kind === kind,
    );
    if (!questions.length) return;
    learningSession = new JournalLearning.Session(course, questions);
  }
  const dialog = document.getElementById("quiz");
  renderQuiz();
  if (!dialog.open) dialog.showModal();
  focusQuiz();
}
function focusQuiz(answer = false) {
  const dialog = document.getElementById("quiz");
  dialog.scrollTop = 0;
  document
    .getElementById(answer ? "answer-result" : "quiz-heading")
    ?.focus({ preventScroll: !answer });
}
function renderQuiz() {
  document.getElementById("quiz-content").innerHTML =
    JournalLearning.quiz(learningSession);
}
document.getElementById("quiz").addEventListener("close", () => {
  if (JOURNAL_DATA && pageRoute() === "courses") {
    courses();
    main.focus({ preventScroll: true });
  }
});
document.addEventListener("click", (event) => {
  const b = event.target.closest("button,[data-go]");
  if (!b) return;
  if (b.hasAttribute("data-switch-account")) {
    JournalReader.connect({ switchAccount: true });
    return;
  }
  if (b.hasAttribute("data-connect")) {
    JournalReader.connect();
    return;
  }
  if (b.hasAttribute("data-disconnect")) {
    JournalReader.disconnect();
    return;
  }
  if (b.hasAttribute("data-configure-google")) {
    JournalReader.setClient(
      document.getElementById("google-client").value.trim(),
    ).catch((e) => {
      document.getElementById("setup-status").textContent = e.message;
    });
    return;
  }
  if (b.hasAttribute("data-load-issue")) {
    readerDestination = "journal";
    JournalReader.loadIssue(b.dataset.loadIssue).catch(() => {
      readerDestination = null;
    });
    return;
  }
  if (b.hasAttribute("data-download-pdf")) {
    if (readerPdfBusy) return;
    readerPdfBusy = true;
    toast("Téléchargement du PDF…");
    JournalReader.pdf()
      .then((file) => {
        const a = document.createElement("a");
        a.href = file.url;
        a.download = file.name;
        document.body.append(a);
        a.click();
        a.remove();
      })
      .catch((e) => toast(e.message))
      .finally(() => (readerPdfBusy = false));
    return;
  }
  if (b.hasAttribute("data-theme")) {
    theme = b.dataset.theme;
    JournalAppearance.setPreference(theme);
    return;
  }
  if (b.hasAttribute("data-size")) {
    size = Number(b.dataset.size);
    save("size", size);
    applyPreferences();
    toast("Taille du texte : " + size + " px");
    return;
  }
  if (b.dataset.go === "settings") {
    go("settings");
    return;
  }
  if (b.hasAttribute("data-return")) {
    const target = JournalNavigation.take(
      pageRoute() === "settings" ? "/app/#home" : "#" + readingReturn.route,
    );
    const url = new URL(target.url, location.href);
    if (url.pathname === location.pathname && url.search === location.search) {
      pendingReturnScroll = target.scroll;
      go(url.hash.slice(1) || "home", false);
    } else JournalNavigation.leave(target);
    return;
  }
  if (!JOURNAL_DATA) {
    if (b.hasAttribute("data-go"))
      toast("Connectez-vous pour accéder à votre bibliothèque.");
    return;
  }
  if (b.hasAttribute("data-share-source")) {
    const a = JOURNAL_DATA.articles[Number(b.dataset.shareSource)];
    if (!a) return;
    JournalNativeUI.shareSource(a.url)
      .then((result) => {
        if (result === "copied") toast("Lien public de la source copié");
      })
      .catch((error) => toast(error.message));
    return;
  }
  if (b.hasAttribute("data-go")) {
    if (
      b.dataset.go.startsWith("article/") &&
      !pageRoute().startsWith("article/")
    )
      readingReturn = { route: pageRoute(), scroll: scrollY };
    go(b.dataset.go);
    return;
  }
  if (b.hasAttribute("data-save")) {
    const id = JOURNAL_DATA.articles[Number(b.dataset.save)].id;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    save("favorites", [...favorites]);
    if (pageRoute() === "saved") {
      const y = scrollY;
      render();
      window.scrollTo(0, y);
    } else {
      document
        .querySelectorAll('[data-save="' + b.dataset.save + '"]')
        .forEach((el) => {
          el.setAttribute("aria-pressed", String(favorites.has(id)));
          el.setAttribute(
            "aria-label",
            favorites.has(id)
              ? "Retirer des favoris"
              : "Enregistrer dans les favoris",
          );
        });
    }
    toast(
      favorites.has(id) ? "Article enregistré" : "Article retiré des favoris",
    );
  } else if (b.hasAttribute("data-font")) {
    const sizes = [16, 18, 21];
    size =
      sizes[
        Math.min(2, Math.max(0, sizes.indexOf(size) + Number(b.dataset.font)))
      ];
    save("size", size);
    applyPreferences();
    toast("Taille du texte : " + size + " px");
  } else if (b.hasAttribute("data-course-references")) {
    const references = document.getElementById("course-references");
    references?.focus();
    references?.scrollIntoView({ block: "start" });
  } else if (b.hasAttribute("data-quiz")) {
    startQuiz(b.dataset.quiz);
  } else if (b.hasAttribute("data-close-quiz")) {
    document.getElementById("quiz").close();
  } else if (b.hasAttribute("data-answer")) {
    if (!learningSession?.answer(Number(b.dataset.answer))) return;
    renderQuiz();
    focusQuiz(true);
  } else if (b.hasAttribute("data-next-quiz")) {
    if (!learningSession?.next()) return;
    renderQuiz();
    focusQuiz();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "search" || !JOURNAL_DATA) return;
  const term = event.target.value.trim().toLocaleLowerCase("fr");
  const results = document.getElementById("search-results");
  document.getElementById("menu-topics").hidden = !!term;
  if (!term) {
    results.innerHTML = "";
    return;
  }
  const indices = JOURNAL_DATA.articles
    .map((_, i) => i)
    .filter((i) => searchIndex[i].includes(term));
  results.innerHTML = `<h2 class="section-title">Résultats <small>${indices.length} article${indices.length > 1 ? "s" : ""}</small></h2>${indices.length ? indices.map(articleRow).join("") : '<p class="empty">Aucun résultat dans cette édition.</p>'}`;
});
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("hashchange", () => {
  document.getElementById("quiz").close();
  render();
  const targetScroll = pendingReturnScroll ?? 0;
  pendingReturnScroll = null;
  main.focus({ preventScroll: true });
  window.scrollTo(0, targetScroll);
  requestAnimationFrame(() => {
    window.scrollTo(0, targetScroll);
    updateReadingProgress();
  });
});
window.addEventListener("reader:state", () => {
  const state = JournalReader.snapshot();
  if (state.status === "ready") {
    const changed = JOURNAL_DATA?.version !== state.data.version;
    if (changed) clearLearning();
    JOURNAL_DATA = state.data;
    searchIndex = JOURNAL_DATA.articles.map((a) =>
      (a.title + " " + a.paragraphs.join(" ")).toLocaleLowerCase("fr"),
    );
    readerNamespace = state.userKey;
    favorites = new Set(read("favorites", []));
    if (changed || readerDestination) {
      const requested = pageRoute();
      const destination =
        readerDestination ||
        (requested.startsWith("article/") ||
        ["courses", "lesson", "settings"].includes(requested)
          ? requested
          : "home");
      readerDestination = null;
      const url = new URL(location.href);
      url.searchParams.set("edition", JOURNAL_DATA.version);
      history.replaceState(
        null,
        "",
        url.pathname + url.search + "#" + destination,
      );
    }
  } else {
    searchIndex = [];
    JOURNAL_DATA = null;
    favorites = new Set();
    clearLearning();
  }
  render();
});
JournalReader.init();
