# Security policy

This is a private, household-only application. It is not intended for public
deployment or multi-tenant use. The security posture is designed for two known
users on a custom domain.

## Threat model in scope

- Account takeover via stolen Google credentials (mitigated by Google's own
  controls + an allow-list).
- Database exfiltration by a third party (mitigated by managed-Postgres access
  controls + application-level encryption of sensitive fields).
- Accidental disclosure of financial detail in logs, error reports, or
  third-party requests (mitigated by structured logging that omits PII /
  amounts and a strict Content Security Policy).

## Out of scope

- Targeted nation-state attackers.
- Endpoint compromise on a household member's own device.
- Insider abuse between the two authorized users.

## Hard requirements

These are enforced (or planned to be enforced) in code and CI:

1. **Sign-in is Google OAuth only.** No password authentication.
2. **Allow-list.** Only emails present in `AllowedEmail` may sign in. New
   sign-ins from unknown emails return a generic 403 with no enumeration.
3. **Server-side authorization** on every API route. The client is never
   trusted; role is read from the session and re-checked against the database
   for mutations.
4. **HTTPS everywhere** (Vercel + custom domain).
5. **AES-256-GCM application-level encryption** for sensitive columns:
   account numbers/last-4, notes, transaction descriptions. The key lives in
   `FIELD_ENCRYPTION_KEY` and never reaches the browser.
6. **PII minimization.** We store only `googleSub`, email, display name, and
   avatar URL.
7. **No request bodies in production logs.** Currency codes and FX rates are
   not PII and may be logged.
8. **CSRF protection** via Auth.js on all mutations.
9. **Rate limiting** on auth and write endpoints.
10. **Strict CSP** — no inline scripts; only Google auth and configured FX
    providers are allowed as third-party origins.
11. **Audit log.** Every structural change writes an immutable
    `AuditLog` row with actor, action, and before/after JSON.
12. **No analytics or third-party trackers.**
13. **Daily managed backups** at the database provider, with a documented
    restore procedure.

## Reporting

This repository has no public security inbox — it is a personal project. If
you have stumbled upon it and have a concern, open a private security advisory
on GitHub against the repository.
