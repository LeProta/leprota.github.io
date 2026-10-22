import { test } from "node:test";
import assert from "node:assert/strict";
import { OAuth2Client } from "google-auth-library";
import { googleProvider, SCOPE } from "./server.mjs";
test("configuration de la bibliothèque OAuth Google réelle, sans appel réseau", () => {
  const p = googleProvider(OAuth2Client, {
    clientId: "public-client-test",
    clientSecret: "secret-test-only",
    origin: "https://journal.example.test",
  });
  const url = new URL(
    p.authorizationURL({ state: "state-test", verifier: "verifier-test" }),
  );
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://journal.example.test/auth/google/callback",
  );
  assert(!url.href.includes("secret-test-only"));
});
