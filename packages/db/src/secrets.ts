import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for the provider tokens stored on connections. The key comes
 * from CONNECTION_SECRET_KEY (any long random string; it is hashed to 32
 * bytes). Changing the key makes stored tokens unreadable, so every
 * connection would need reconnecting.
 */

function key(secret = process.env.CONNECTION_SECRET_KEY) {
  if (!secret || secret.length < 16) throw new Error("CONNECTION_SECRET_KEY is not set (use at least 32 random characters).");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, secret?: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Stored token is not in a format Vantiq can read.");
  const d = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
