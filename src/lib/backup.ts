/**
 * Encrypted JSON backup format.
 *
 * Produces a single `.json.enc` envelope:
 *
 *   {
 *     version: "1",
 *     algorithm: "PBKDF2-SHA256+AES-256-GCM",
 *     iterations: 600000,
 *     salt: base64,
 *     iv: base64,
 *     ciphertext: base64,
 *     authTag: base64,
 *     createdAt: ISO date,
 *     entityCounts: { Account: n, Transaction: n, ... }
 *   }
 *
 * The passphrase is supplied by the admin at export time — we never store
 * it, the secret-key field doesn't help here because the goal is offline
 * portability. Decryption is symmetric (PBKDF2 → key → AES-GCM).
 *
 * Encrypted columns (`*Encrypted`) are exported as-is — they're still
 * AES-256-GCM ciphertext under `FIELD_ENCRYPTION_KEY` from the live env.
 * To fully recover from the backup you need *both* the backup passphrase
 * AND the field-encryption key.
 */

import "server-only";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation
const PBKDF2_KEYLEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const ALGO = "aes-256-gcm";
const FORMAT_VERSION = "1";

export type BackupEnvelope = {
  version: string;
  algorithm: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  createdAt: string;
  entityCounts: Record<string, number>;
};

export type BackupSnapshot = {
  exportedAt: string;
  entityCounts: Record<string, number>;
  data: Record<string, unknown[]>;
};

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha256");
}

export function encryptBackup(snapshot: BackupSnapshot, passphrase: string): BackupEnvelope {
  if (!passphrase || passphrase.length < 12) {
    throw new Error("Backup passphrase must be at least 12 characters.");
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(snapshot), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: FORMAT_VERSION,
    algorithm: `PBKDF2-SHA256+AES-256-GCM`,
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
    createdAt: snapshot.exportedAt,
    entityCounts: snapshot.entityCounts,
  };
}

export function decryptBackup(envelope: BackupEnvelope, passphrase: string): BackupSnapshot {
  if (envelope.version !== FORMAT_VERSION) {
    throw new Error(`Unsupported backup version: ${envelope.version}.`);
  }
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as BackupSnapshot;
}
