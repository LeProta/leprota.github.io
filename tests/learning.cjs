const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const w = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../app/learning.js"), "utf8"),
  { window: w },
);
const api = w.JournalLearning;
const course = {
  title: "Une fiche de test",
  explanation: "Un premier paragraphe.\n\nUn second paragraphe.",
  references: [
    {
      document: "Support de test.docx",
      locator: "Partie 2",
      excerpt: "Un extrait de test.",
    },
  ],
  quiz: [
    {
      id: "a",
      kind: "qcm",
      prompt: "Question A ?",
      options: ["Alpha", "Bêta"],
      answer: 0,
      explanation: "Explication A.",
      evidence: [0],
    },
    {
      id: "b",
      kind: "true_false",
      prompt: "Affirmation B.",
      answer: false,
      explanation: "Explication B.",
      evidence: [0],
    },
    {
      id: "c",
      kind: "qcm",
      prompt: "Question C ?",
      options: ["Alpha", "Bêta", "Gamma"],
      answer: 2,
      explanation: "Explication C.",
      evidence: [0],
    },
    {
      id: "d",
      kind: "true_false",
      prompt: "Affirmation D.",
      answer: true,
      explanation: "Explication D.",
      evidence: [0],
    },
  ],
};
const session = new api.Session(course);
assert.equal(session.score, 0);
assert.equal(
  session.next(),
  false,
  "Une question sans réponse ne peut pas être sautée",
);
for (const invalid of [-1, 2, 1.5, NaN, "0"])
  assert.equal(session.answer(invalid), false);
assert.equal(session.answer(0), true);
assert.equal(
  session.answer(1),
  false,
  "Une double pression ne change pas la réponse",
);
assert.equal(session.completed, 1);
assert.equal(session.score, 1);
assert.match(api.quiz(session), /Support de test.docx/);
assert.match(api.quiz(session), /Un extrait de test/);
assert.match(api.home(course, "18 octobre", session), /Reprendre/);
session.next();
session.answer(0);
session.next(); // Faux attendu : réponse volontairement erronée.
session.answer(2);
session.next();
session.answer(1);
session.next();
assert(session.done);
assert.equal(session.completed, 4);
assert.equal(session.score, 2);
assert.equal(session.mistakes.length, 2);
assert.match(api.quiz(session), /Reprendre mes erreurs/);
assert.match(api.quiz(session), /Votre réponse/);
assert.match(api.quiz(session), /Faux/);
assert.equal(session.answer(0), false);
assert.equal(session.next(), false);
const retry = session.retry();
assert.equal(retry.questions.length, 2);
assert.equal(retry.questions[0].id, "b");
assert.equal(retry.completed, 0);
retry.answer(1);
retry.next();
retry.answer(0);
retry.next();
assert.equal(retry.score, 2);
assert(!api.quiz(retry).includes('data-quiz="mistakes"'));
assert(!api.home({ ...course, quiz: [] }, "18 octobre").includes("data-quiz="));
assert(!api.lesson({ ...course, quiz: [] }).includes("data-quiz="));
assert.match(api.home(null, "18 octobre"), /ne contient pas/);
assert.equal(
  (api.references(course, [0, 0]).match(/<details/g) || []).length,
  1,
);
assert.match(
  api.lesson(course),
  /<p>Un premier paragraphe.<\/p><p>Un second paragraphe.<\/p>/,
);
const hostile = structuredClone(course);
hostile.title = '<img src=x onerror="alert(1)">';
hostile.references[0].document = "<script>alert(1)</script>";
hostile.references[0].excerpt = '<svg onload="alert(1)">';
hostile.quiz[0].options[0] = "<img src=x onerror=alert(1)>";
hostile.quiz[0].explanation = "<script>secret</script>";
const hostileSession = new api.Session(hostile);
hostileSession.answer(0);
for (const html of [
  api.home(hostile, "date"),
  api.lesson(hostile),
  api.quiz(hostileSession),
]) {
  assert(
    !/<(?:script|img)\b|<svg\s+onload/.test(html),
    "Le texte des supports reste échappé",
  );
  assert(html.includes("&lt;"));
}
console.log(
  "Cours : QCM/vrai-faux, réponses uniques, bilan, reprise des erreurs, références et échappement : OK.",
);
