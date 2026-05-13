import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetForTests, callerIp, RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    __resetForTests();
    vi.useRealTimers();
  });

  it("allows up to max requests in the window", () => {
    const cfg = { max: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) {
      const r = rateLimit("k", cfg);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const denied = rateLimit("k", cfg);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("isolates buckets by key", () => {
    const cfg = { max: 1, windowSec: 60 };
    expect(rateLimit("a", cfg).allowed).toBe(true);
    expect(rateLimit("b", cfg).allowed).toBe(true);
    expect(rateLimit("a", cfg).allowed).toBe(false);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cfg = { max: 1, windowSec: 1 };
    expect(rateLimit("k", cfg).allowed).toBe(true);
    expect(rateLimit("k", cfg).allowed).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(rateLimit("k", cfg).allowed).toBe(true);
  });

  it("default limits are well-formed", () => {
    expect(RATE_LIMITS.signIn.max).toBe(5);
    expect(RATE_LIMITS.apiWrite.windowSec).toBe(60);
    expect(RATE_LIMITS.backup.max).toBe(3);
  });
});

describe("callerIp", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://x.test/", { headers });
  }

  it("uses the first IP from x-forwarded-for when present", () => {
    expect(callerIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(callerIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns 0.0.0.0 when nothing is set", () => {
    expect(callerIp(req({}))).toBe("0.0.0.0");
  });
});
