import { describe, it, expect } from "vitest";
import { decryptBackup, encryptBackup, type BackupSnapshot } from "@/lib/backup";

const snapshot: BackupSnapshot = {
  exportedAt: "2026-05-12T00:00:00.000Z",
  entityCounts: { Account: 2, Transaction: 17 },
  data: {
    Account: [{ id: "a1", alias: "Joint Checking" }],
    Transaction: [{ id: "t1", amountMinor: "-1234" }],
  },
};

describe("backup encryption", () => {
  it("round-trips a snapshot under the right passphrase", () => {
    const env = encryptBackup(snapshot, "correct horse battery staple");
    expect(env.algorithm).toContain("AES-256-GCM");
    expect(env.entityCounts.Account).toBe(2);
    const restored = decryptBackup(env, "correct horse battery staple");
    expect(restored).toEqual(snapshot);
  });

  it("refuses passphrases shorter than 12 characters", () => {
    expect(() => encryptBackup(snapshot, "short")).toThrow(/12 characters/);
  });

  it("decryption fails on the wrong passphrase (auth-tag mismatch)", () => {
    const env = encryptBackup(snapshot, "correct horse battery staple");
    expect(() => decryptBackup(env, "another long passphrase here")).toThrow();
  });

  it("two encryptions of the same plaintext produce distinct ciphertexts (random IV/salt)", () => {
    const a = encryptBackup(snapshot, "correct horse battery staple");
    const b = encryptBackup(snapshot, "correct horse battery staple");
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("envelope advertises algorithm + version + iterations explicitly", () => {
    const env = encryptBackup(snapshot, "correct horse battery staple");
    expect(env.version).toBe("1");
    expect(env.iterations).toBeGreaterThanOrEqual(100_000);
  });
});
