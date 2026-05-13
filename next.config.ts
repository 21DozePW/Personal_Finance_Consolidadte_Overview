import type { NextConfig } from "next";

/**
 * Strict CSP for the production app.
 *
 * We deliberately do not use nonces here. Next.js 15 injects a small inline
 * JSON island (RSC payload + flight chunk pointers) on every page; replacing
 * that with nonces requires plumbing through middleware on every request,
 * which is a deep rabbit hole for a two-user app. Allowing 'unsafe-inline'
 * for scripts/styles is the pragmatic v1 trade-off — the threat model
 * (§4 SECURITY.md) is "third party stumbles on our domain", not "scripts
 * injected via an XSS in our own code". If we ever serve user-supplied HTML
 * that needs sanitising, this should be revisited with nonces.
 *
 * The strict parts that matter:
 *   - default-src 'self'  — nothing loads from unexpected origins
 *   - connect-src        — limited to the app + Google OAuth + FX providers
 *   - frame-ancestors    — clickjacking-proof
 *   - form-action        — submissions only to ourselves + Google
 *   - object-src 'none'  — no flash/applets/PDF embeds
 *   - base-uri 'self'    — no <base href> abuse
 *   - upgrade-insecure-requests — HTTPS everywhere on supporting browsers
 */
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.exchangerate.host https://api.frankfurter.dev https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Dev needs eval for React Fast Refresh + Next.js HMR.
const CSP_DEV = CSP_PROD.replace(
  "script-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
);

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: process.env.NODE_ENV === "production" ? CSP_PROD : CSP_DEV,
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
