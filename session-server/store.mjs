import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Le stockage ne contient ni cookie utilisable ni jeton Google en clair.
export class EncryptedStore {
  constructor(raw, key, clock = Date.now) {
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new Error("Clé de chiffrement de 32 octets requise");
    this.raw = raw;
    this.key = key;
    this.clock = clock;
  }
  id(kind, value) {
    return `${kind}-${createHash("sha256").update(value).digest("hex")}`;
  }
  async put(kind, id, data, expires) {
    const name = this.id(kind, id),
      iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(name));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(data)),
      cipher.final(),
    ]);
    await this.raw.set(name, {
      encrypted: Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
        "base64",
      ),
      expires,
    });
  }
  async read(kind, id, consume = false) {
    const name = this.id(kind, id);
    const record = await this.raw[consume ? "take" : "get"](name);
    if (!record) return null;
    if (!Number.isFinite(record.expires) || record.expires <= this.clock()) {
      await this.raw.delete(name);
      return null;
    }
    const raw = Buffer.from(record.encrypted, "base64");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      raw.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(name));
    cipher.setAuthTag(raw.subarray(12, 28));
    return {
      data: JSON.parse(
        Buffer.concat([
          cipher.update(raw.subarray(28)),
          cipher.final(),
        ]).toString(),
      ),
      expires: record.expires,
    };
  }
  async remove(kind, id) {
    await this.raw.delete(this.id(kind, id));
  }
}

export class FirestoreStore {
  constructor(db, collection = "journal-reader-sessions") {
    this.collection = db.collection(collection);
    this.db = db;
  }
  async get(id) {
    const snapshot = await this.collection.doc(id).get();
    return snapshot.exists ? snapshot.data() : null;
  }
  async set(id, value) {
    await this.collection
      .doc(id)
      .set({ ...value, expiresAt: new Date(value.expires) });
  }
  async delete(id) {
    await this.collection.doc(id).delete();
  }
  async take(id) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.collection.doc(id),
        snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      transaction.delete(ref);
      return snapshot.data();
    });
  }
}
