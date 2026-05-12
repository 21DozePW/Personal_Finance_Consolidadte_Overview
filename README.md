# Household Finance

Private household financial management web app. Two named users, Google OAuth
only, CHF-consolidated multi-currency reporting.

> **Status:** Phase 0 — scaffolding only. No auth, no UI features, no data
> flow yet. The full data model is in `prisma/schema.prisma`; subsequent
> phases wire it up.

## What this is (and isn't)

- **Is:** a single-household, two-user app for consolidated net worth, cash
  flow, budgets, goals, and forecasts. Reporting currency is CHF; accounts
  can be in any ISO 4217 currency.
- **Isn't:** a multi-tenant SaaS, a tax tool, or an investment-analytics
  product. Open Banking integration is deferred to a later phase.

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui
- PostgreSQL · Prisma 5
- Auth.js v5 (Google provider) — Phase 1
- Zod · React Hook Form · TanStack Query — Phase 1+
- Vitest (unit) · Playwright (e2e)
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

## Build phases

The product is delivered in incremental phases (see the spec). Phase 0 ends
here: the project compiles, lints, typechecks, runs unit tests, and the
Prisma schema covers the full data model. Phase 1 wires up authentication.
