"use strict";
(() => {
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const options = (q) => (q.kind === "qcm" ? q.options : ["Vrai", "Faux"]);
  const correct = (q) => (q.kind === "qcm" ? q.answer : q.answer ? 0 : 1);
  const label = (q, i) =>
    (q.kind === "qcm" ? String.fromCharCode(65 + i) + ". " : "") +
    options(q)[i];
  const paragraphs = (s) =>
    String(s)
      .split(/\n\s*\n/)
      .filter((x) => x.trim())
      .map((x) => `<p>${esc(x)}</p>`)
      .join("");
  function references(course, indices = course.references.map((_, i) => i)) {
    const unique = [...new Set(indices)].filter((i) => course.references[i]);
    if (!unique.length)
      return '<p class="small-note">Aucun passage de support associé dans cette édition.</p>';
    return unique
      .map((i) => {
        const r = course.references[i];
        return `<details class="course-reference"><summary><span>${esc(r.document)}</span><span class="reference-locator">${esc(r.locator)}</span></summary><blockquote>${esc(r.excerpt)}</blockquote></details>`;
      })
      .join("");
  }
  class Session {
    constructor(course, questions = course.quiz) {
      this.course = course;
      this.questions = [...questions];
      this.answers = this.questions.map(() => null);
      this.index = 0;
    }
    get current() {
      return this.questions[this.index];
    }
    get done() {
      return this.index >= this.questions.length;
    }
    get answered() {
      return this.answers[this.index] !== null && !this.done;
    }
    get completed() {
      return this.answers.filter((x) => x !== null).length;
    }
    get score() {
      return this.questions.reduce(
        (n, q, i) => n + Number(this.answers[i] === correct(q)),
        0,
      );
    }
    get mistakes() {
      return this.questions.filter(
        (q, i) => this.answers[i] !== null && this.answers[i] !== correct(q),
      );
    }
    answer(index) {
      if (
        this.done ||
        this.answered ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= options(this.current).length
      )
        return false;
      this.answers[this.index] = index;
      return true;
    }
    next() {
      if (!this.answered) return false;
      this.index++;
      return true;
    }
    retry() {
      return new Session(this.course, this.mistakes);
    }
  }
  function home(course, date, session) {
    if (!course)
      return '<h2 class="section-title">Votre espace de révision</h2><p class="empty">Cette édition ne contient pas de fiche de cours validée.</p>';
    const qcm = course.quiz.filter((q) => q.kind === "qcm").length;
    const vf = course.quiz.filter((q) => q.kind === "true_false").length;
    const resume =
      session && !session.done
        ? `<section class="course-resume"><div><p class="eyebrow">Entraînement en cours</p><p>${session.completed} réponse${session.completed > 1 ? "s" : ""} sur ${session.questions.length} · conservé tant que cette édition reste ouverte.</p></div><button class="subtle-button" data-quiz="resume">Reprendre</button></section>`
        : "";
    return `<div class="edition-line"><span>Le cahier des cours</span><span>${esc(date)}</span></div><h2 class="section-title">Comprendre et s’entraîner</h2>${resume}<div class="cards-grid"><button class="learning-card big" data-go="lesson"><span class="learning-step">01 · Comprendre</span><h3>${esc(course.title)}</h3><p>Une fiche et ses passages de référence, réunis pour votre lecture.</p><span class="white-button">Lire la fiche</span></button>${qcm ? `<button class="learning-card qcm" data-quiz="qcm"><span class="learning-step">02 · S’exercer</span><h3>QCM</h3><p>${qcm} question${qcm > 1 ? "s" : ""} à réponse unique, avec corrigés.</p><span class="white-button">Commencer</span></button>` : ""}${vf ? `<button class="learning-card vf" data-quiz="true_false"><span class="learning-step">03 · Se vérifier</span><h3>Vrai ou faux</h3><p>${vf} affirmation${vf > 1 ? "s" : ""} à examiner et à expliquer.</p><span class="white-button">Commencer</span></button>` : ""}</div>${course.quiz.length ? '<section class="course-practice"><h3>Le parcours complet</h3><p>Alternez les formats, consultez chaque correction, puis reprenez vos erreurs.</p><button class="blue-button" data-quiz="all">Tout pratiquer</button></section>' : '<p class="learning-source">Aucun exercice n’accompagne cette fiche.</p>'}<p class="learning-source">Les exercices utilisent les passages de cours associés à cette édition. Vos réponses restent en mémoire dans cette fenêtre et sont effacées à la déconnexion ou au changement d’édition.</p>`;
  }
  function lesson(course) {
    return `<div class="article-toolbar"><button class="subtle-button" data-go="courses">← Mes cours</button><span class="eyebrow">Comprendre</span></div><h2 class="headline">${esc(course.title)}</h2><div class="article-body course-explanation">${paragraphs(course.explanation)}</div><div class="course-actions">${course.quiz.length ? '<button class="blue-button" data-quiz="all">Vérifier mes acquis</button>' : ""}<button class="subtle-button" data-course-references>Consulter les passages</button></div><section class="source-box" id="course-references" tabindex="-1"><h2>Les passages de référence</h2><p class="small-note">Ouvrez un passage pour lire l’extrait et son emplacement dans le support. Ces extraits ne remplacent pas le document complet.</p>${references(course)}</section>`;
  }
  function feedback(session) {
    const q = session.current,
      selected = session.answers[session.index];
    return `<h3 id="answer-result" tabindex="-1">${selected === correct(q) ? "Bonne réponse" : "Une notion à revoir"}</h3><p><strong>Réponse attendue :</strong> ${esc(label(q, correct(q)))}</p>${paragraphs(q.explanation)}<div class="answer-references"><h4>Vérifier dans le cours</h4>${references(session.course, q.evidence || [])}</div>`;
  }
  function quiz(session) {
    const top = (text) =>
      `<div class="quiz-top"><span>${text}</span><button class="round" data-close-quiz aria-label="Fermer l’exercice"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button></div>`;
    if (session.done) {
      return `${top("Bilan de la série")}<h2 class="quiz-title" id="quiz-heading" tabindex="-1">Votre entraînement, en détail</h2><p class="quiz-score">${session.score}<span> / ${session.questions.length}</span></p><p>${session.mistakes.length ? `${session.mistakes.length} réponse${session.mistakes.length > 1 ? "s" : ""} à retravailler. Relisez les explications ci-dessous ou reprenez ces questions.` : "Toutes les réponses de cette série sont correctes."}</p><p class="small-note">Ce résultat concerne uniquement cette série de questions.</p><div class="course-actions">${session.mistakes.length ? '<button class="blue-button" data-quiz="mistakes">Reprendre mes erreurs</button>' : ""}<button class="subtle-button" data-quiz="all">Recommencer la série complète</button></div><section class="quiz-review"><h3>Vos réponses et les corrigés</h3>${session.questions.map((q, i) => `<details><summary><span class="review-verdict">${session.answers[i] === correct(q) ? "Correct" : "À revoir"} · ${i + 1}</span>${esc(q.prompt)}</summary><p><strong>Votre réponse :</strong> ${esc(label(q, session.answers[i]))}</p><p><strong>Réponse attendue :</strong> ${esc(label(q, correct(q)))}</p>${paragraphs(q.explanation)}${references(session.course, q.evidence || [])}</details>`).join("")}</section><button class="subtle-button" data-close-quiz>Fermer le bilan</button>`;
    }
    const q = session.current;
    return `${top(`${q.kind === "qcm" ? "QCM · Une seule réponse" : "Vrai ou faux"} · ${session.index + 1}/${session.questions.length}`)}<progress class="quiz-progress" value="${session.completed}" max="${session.questions.length}" aria-label="Questions répondues"></progress><h2 class="quiz-title" id="quiz-heading" tabindex="-1">${esc(q.prompt)}</h2><div class="quiz-options">${options(
      q,
    )
      .map(
        (_, i) =>
          `<button class="answer${session.answered && i === correct(q) ? " correct" : session.answered && i === session.answers[session.index] ? " wrong" : ""}" data-answer="${i}" ${session.answered ? "disabled" : ""}>${esc(label(q, i))}${session.answered && i === correct(q) ? '<span class="answer-verdict">Réponse attendue</span>' : session.answered && i === session.answers[session.index] ? '<span class="answer-verdict">Votre réponse</span>' : ""}</button>`,
      )
      .join(
        "",
      )}</div><div id="feedback" class="feedback" aria-live="polite">${session.answered ? feedback(session) : ""}</div>${session.answered ? `<div class="quiz-next"><button class="blue-button" data-next-quiz>${session.index === session.questions.length - 1 ? "Voir mon bilan" : "Question suivante"}</button></div>` : '<p class="small-note">Choisissez une réponse pour découvrir son explication.</p>'}`;
  }
  window.JournalLearning = Object.freeze({
    Session,
    home,
    lesson,
    quiz,
    references,
  });
})();
