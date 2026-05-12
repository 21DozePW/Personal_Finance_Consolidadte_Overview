/**
 * Application-level field encryption (AES-256-GCM).
 *
 * Used for sensitive `*Encrypted` columns: account last-4 digits, free-text
 * notes, transaction descriptions, etc. The key (`FIELD_ENCRYPTION_KEY`) is a
 * base64-encoded 32-byte secret stored as an env var; it never leaves the
 * server.
 *
 * Ciphertext format: `v1.<iv>.<ct>.<tag>` (each part base64url-encoded).
 * The version prefix lets us roll new keys later without breaking decryption
 * of values written under the old key.
 */

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const CURRENT_VERSION = "v1";

let cachedKey: Buffer | null = null;
let cachedKeyRaw: string | null = null;

function loadKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  if (cachedKey && cachedKeyRaw === raw) return cachedKey;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_LEN) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (256 bits); got ${decoded.length}`,
    );
  }
  cachedKey = decoded;
  cachedKeyRaw = raw;
  return decoded;
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  if (plain === "") return null;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CURRENT_VERSION}.${iv.toString("base64url")}.${ct.toString("base64url")}.${tag.toString(
    "base64url",
  )}`;
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  const parts = stored.split(".");
  if (parts.length !== 4) throw new Error("Invalid ciphertext: malformed envelope");
  const [version, ivB64, ctB64, tagB64] = parts as [string, string, string, string];
  if (version !== CURRENT_VERSION) {
    throw new Error(`Invalid ciphertext: unknown key version "${version}"`);
  }
  const iv = Buffer.from(ivB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_LEN) throw new Error("Invalid ciphertext: bad IV length");
  const decipher = createDecipheriv(ALGO, loadKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Constant-time comparison helper for ciphertext fingerprints, useful in
 * future when (e.g.) deduping rows by hashed plaintext rather than
 * decrypting and comparing.
 */
export function ciphertextEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
