"use strict";
(() => {
  const fail = () => {
    throw new Error("Le contenu reçu ne correspond pas au format du journal.");
  };
  const string = (x, n) =>
    typeof x === "string" &&
    x.trim().length > 0 &&
    x.length <= n &&
    !x.includes("\u0000");
  const id = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x);
  const hash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
  const day = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !Number.isNaN(Date.parse(x)) &&
    new Date(x + "T12:00:00Z").toISOString().slice(0, 10) === x;
  const link = (x) => {
    try {
      const u = new URL(x);
      return (
        string(x, 2000) && u.protocol === "https:" && !u.username && !u.password
      );
    } catch {
      return false;
    }
  };
  const ref = (x) => x && id(x.file_id) && hash(x.sha256);
  const article = (a) => {
    if (
      !a ||
      a.schema !== 1 ||
      !id(a.id) ||
      !string(a.title, 240) ||
      !string(a.deck, 1000) ||
      !string(a.section, 100) ||
      !Array.isArray(a.paragraphs) ||
      a.paragraphs.length < 1 ||
      a.paragraphs.length > 100 ||
      !a.paragraphs.every((p) => string(p, 30000)) ||
      !a.source ||
      !string(a.source.label, 200) ||
      !link(a.source.url) ||
      !hash(a.proof_sha256)
    )
      fail();
    if (a.media_key && !id(a.media_key)) fail();
    return a;
  };
  const course = (c) => {
    if (c === null || c === undefined) return null;
    if (
      !string(c.title, 240) ||
      !string(c.explanation, 30000) ||
      !Array.isArray(c.references) ||
      c.references.length > 20 ||
      !c.references.every(
        (r) =>
          string(r.document, 300) &&
          string(r.locator, 200) &&
          string(r.excerpt, 10000),
      ) ||
      !Array.isArray(c.quiz) ||
      c.quiz.length > 20
    )
      fail();
    const used = new Set();
    for (const q of c.quiz) {
      if (
        !id(q.id) ||
        used.has(q.id) ||
        !string(q.prompt, 1000) ||
        !string(q.explanation, 4000) ||
        !Array.isArray(q.evidence) ||
        !q.evidence.every(
          (i) => Number.isInteger(i) && i >= 0 && i < c.references.length,
        )
      )
        fail();
      used.add(q.id);
      if (q.kind === "qcm") {
        if (
          !Array.isArray(q.options) ||
          q.options.length < 2 ||
          q.options.length > 8 ||
          !q.options.every((o) => string(o, 1000)) ||
          !Number.isInteger(q.answer) ||
          q.answer < 0 ||
          q.answer >= q.options.length
        )
          fail();
      } else if (q.kind !== "true_false" || typeof q.answer !== "boolean")
        fail();
    }
    return c;
  };
  const catalog = (c) => {
    if (
      !c ||
      c.schema !== 1 ||
      c.role !== "journal_reader_v1" ||
      !Array.isArray(c.editions) ||
      c.editions.length > 5000
    )
      fail();
    const versions = new Set();
    for (const e of c.editions) {
      if (
        !id(e.id) ||
        !day(e.date) ||
        !hash(e.version) ||
        versions.has(e.version) ||
        !ref(e) ||
        !Number.isInteger(e.revision) ||
        e.revision < 1 ||
        !Number.isInteger(e.article_count) ||
        e.article_count < 1 ||
        e.article_count > 40
      )
        fail();
      versions.add(e.version);
    }
    return {
      ...c,
      editions: [...c.editions].sort(
        (a, b) => b.date.localeCompare(a.date) || b.revision - a.revision,
      ),
    };
  };
  const issue = (x) => {
    if (
      !x ||
      x.schema !== 1 ||
      x.status !== "complete" ||
      !id(x.id) ||
      !day(x.date) ||
      !hash(x.version) ||
      !id(x.lead_id) ||
      !Array.isArray(x.articles) ||
      x.articles.length < 1 ||
      x.articles.length > 40 ||
      !x.articles.every((r) => ref(r) && id(r.id)) ||
      new Set(x.articles.map((a) => a.id)).size !== x.articles.length ||
      !x.articles.some((a) => a.id === x.lead_id) ||
      !hash(x.source_pdf_sha256)
    )
      fail();
    if (x.pdf && !ref(x.pdf)) fail();
    if (
      !x.media ||
      typeof x.media !== "object" ||
      Array.isArray(x.media) ||
      Object.keys(x.media).length > 20
    )
      fail();
    for (const [key, m] of Object.entries(x.media))
      if (
        !id(key) ||
        !id(m.file_id) ||
        !hash(m.sha256) ||
        !["image/jpeg", "image/png", "image/webp"].includes(m.mime) ||
        !string(m.caption, 500) ||
        !string(m.author, 200) ||
        !string(m.license, 200) ||
        !link(m.license_url) ||
        !link(m.source_url)
      )
        fail();
    course(x.course);
    return x;
  };
  window.ReaderContract = Object.freeze({
    id,
    hash,
    day,
    link,
    article,
    catalog,
    issue,
    course,
  });
})();
