# Household Finance

Private household financial management web app. Two named users, Google OAuth
only, CHF-consolidated multi-currency reporting.

> **Status:** Phase 1 complete — Google OAuth with allow-list enforcement,
> role-based route guards (server + Edge middleware), nav, sign-in flow, and
> the admin "Allowed emails" page (invite + revoke, with audit logging).
> Accounts, balances, transactions, FX, budgets, goals, and forecasts arrive
> in subsequent phases. The full data model is already in
> `prisma/schema.prisma`.

## What this is (and isn't)

- **Is:** a single-household, two-user app for consolidated net worth, cash
  flow, budgets, goals, and forecasts. Reporting currency is CHF; accounts
  can be in any ISO 4217 currency.
- **Isn't:** a multi-tenant SaaS, a tax tool, or an investment-analytics
  product. Open Banking integration is deferred to a later phase.

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui
- PostgreSQL · Prisma 5
- Auth.js v5 (Google provider) — JWT sessions, allow-list enforcement
- Zod (validation) · React Hook Form · TanStack Query — Phase 3+
- Vitest (unit + integration) · Playwright (e2e)
- Vercel (app) + Neon (Postgres) · Vercel Cron for daily FX fetch

## Quick start

```bash
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_*, FIELD_ENCRYPTION_KEY, ADMIN_BOOTSTRAP_EMAIL

npm install
npm run prisma:generate
npm run prisma:migrate    # creates and applies the first migration
npm run prisma:seed       # allow-lists ADMIN_BOOTSTRAP_EMAIL as Admin
npm run dev
```

Generate secrets locally:

```bash
openssl rand -base64 32    # AUTH_SECRET
openssl rand -base64 32    # FIELD_ENCRYPTION_KEY
openssl rand -hex 32       # CRON_SHARED_SECRET
```

## Scripts

| Command                    | What it does                              |
| -------------------------- | ----------------------------------------- |
| `npm run dev`              | Next.js dev server                        |
| `npm run build`            | Production build                          |
| `npm run start`            | Run the production build                  |
| `npm run lint`             | ESLint                                    |
| `npm run format:check`     | Prettier check                            |
| `npm run typecheck`        | `tsc --noEmit`                            |
| `npm test`                 | Vitest (unit)                             |
| `npm run test:e2e`         | Playwright (e2e; builds + starts the app) |
| `npm run prisma:generate`  | Generate the Prisma client                |
| `npm run prisma:migrate`   | Create + apply a dev migration            |
| `npm run prisma:deploy`    | Apply migrations in CI / prod             |
| `npm run prisma:seed`      | Bootstrap admin allow-list + dev data     |

## Repository layout

See section 9 of the build specification. The short version:

```
prisma/        Schema + migrations + seed
src/app/       Next.js App Router (routes, layouts, API)
src/components Reusable UI (shadcn-style)
src/lib/       Cross-cutting helpers (money, fx, encryption, db, auth)
src/server/    Server-only business logic
src/schemas/   Zod schemas shared client + server
tests/unit/    Vitest specs
tests/e2e/     Playwright specs
```

## Security

See [SECURITY.md](./SECURITY.md). Highlights: Google OAuth only, allow-list
enforcement, AES-256-GCM field encryption for sensitive columns, no inline
scripts, no third-party trackers, full audit log of structural changes.

## Auth model (Phase 1)

- **Google OAuth only.** No password sign-in.
- **Allow-list.** Sign-in is rejected unless the Google email is present in
  the `AllowedEmail` table. The error page is intentionally generic so no
  account-enumeration is possible.
- **First sign-in** consumes the invitation, creates a `User` with the
  invited role, and stamps `lastLoginAt`.
- **JWT sessions** with 30-day rolling expiry, 1-day refresh.
- **Edge middleware** gates every non-public route via the JWT cookie.
- **Server guards** (`requireSession`, `requireAdmin`, `requireApiAdmin`)
  re-check `User.isActive` on every request so revoked members are locked
  out immediately, not when their cookie eventually expires.
- **Revocation** deletes the `AllowedEmail` row and marks the linked `User`
  inactive. The last active Admin cannot be revoked.

The Google OAuth redirect URI to register in Google Cloud is:

```
https://<your-domain>/api/auth/callback/google
```

For local development add `http://localhost:3000/api/auth/callback/google`
as an authorized redirect URI on the same OAuth client.

## Build phases

The product is delivered in incremental phases (see the spec). The phase log:

- **Phase 0 — Foundations.** Project compiles, lints, typechecks, unit tests
  pass; Prisma schema covers the full v1 data model.
- **Phase 1 — Auth & skeleton.** Google sign-in, allow-list enforcement,
  role-based routing, admin "Allowed emails" page with audit logging.
- **Phase 2+** — Accounts, balances, transactions, FX, budgets, goals,
  forecasts, hardening.
