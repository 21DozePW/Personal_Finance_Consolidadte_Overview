import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

let encryptField: typeof import("@/lib/encryption").encryptField;
let decryptField: typeof import("@/lib/encryption").decryptField;

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const mod = await import("@/lib/encryption");
  encryptField = mod.encryptField;
  decryptField = mod.decryptField;
});

afterAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("encryptField / decryptField", () => {
  it("round-trips plaintext", () => {
    const ct = encryptField("hello world");
    expect(ct).not.toBeNull();
    expect(ct).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(decryptField(ct)).toBe("hello world");
  });

  it("round-trips Unicode", () => {
    const sample = "Joint — €1’234 · 🦊";
    expect(decryptField(encryptField(sample))).toBe(sample);
  });

  it("returns null for null, undefined, or empty input", () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeNull();
    expect(encryptField("")).toBeNull();
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeNull();
    expect(decryptField("")).toBeNull();
  });

  it("produces a different IV (and thus ciphertext) on each call", () => {
    const a = encryptField("same")!;
    const b = encryptField("same")!;
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("rejects tampered ciphertext (auth tag mismatch)", () => {
    const ct = encryptField("secret")!;
    const parts = ct.split(".");
    // Flip a bit in the ciphertext segment.
    const tampered = Buffer.from(parts[2]!, "base64url");
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    parts[2] = tampered.toString("base64url");
    expect(() => decryptField(parts.join("."))).toThrow();
  });

  it("rejects an unknown version prefix", () => {
    const ct = encryptField("secret")!.replace(/^v1\./, "v9.");
    expect(() => decryptField(ct)).toThrowError(/unknown key version/);
  });

  it("rejects a malformed envelope", () => {
    expect(() => decryptField("not-an-envelope")).toThrow();
  });
});
