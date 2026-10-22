import { Firestore } from "@google-cloud/firestore";
import { OAuth2Client } from "google-auth-library";
import { fileURLToPath } from "node:url";
import { createSessionServer, googleProvider } from "./server.mjs";
import { FirestoreStore } from "./store.mjs";

const required = [
  "APP_ORIGIN",
  "GOOGLE_WEB_CLIENT_ID",
  "GOOGLE_WEB_CLIENT_SECRET",
  "SESSION_ENCRYPTION_KEY",
  "OWNER_GOOGLE_EMAIL",
];
if (required.some((k) => !process.env[k]))
  throw new Error("Configuration privée du serveur incomplète");
const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY, "base64");
const config = {
  origin: process.env.APP_ORIGIN,
  clientId: process.env.GOOGLE_WEB_CLIENT_ID,
  clientSecret: process.env.GOOGLE_WEB_CLIENT_SECRET,
};
createSessionServer({
  ...config,
  ownerEmail: process.env.OWNER_GOOGLE_EMAIL,
  key,
  publicDirectory: fileURLToPath(new URL("../", import.meta.url)),
  rawStore: new FirestoreStore(new Firestore()),
  provider: googleProvider(OAuth2Client, config),
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
