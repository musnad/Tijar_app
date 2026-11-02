# TIJAR — Implementation Roadmap (Phase 1 Audit)

> Principle: preserve what works (record-keeping on Supabase), deliver the tagline (**visibility**) next, add intelligence last. No phase starts without the exit criteria of the previous one.

## Current state in one paragraph

Marketing site + working record-keeping product (sales, expenses, stock, customers/suppliers credit, health insights, learn) on Supabase with RLS; Android is a WebView shell over the same web app; deployed on Vercel; 30/30 unit tests pass; no CI, no RLS tests, no AI/maps/marketplace/storefront code.

## Phase A — Stabilise and protect (before new features)

| # | Task | Exit criteria |
|---|------|---------------|
| A1 | Set `VITE_PUBLIC_APP_URL=https://tijar-two.vercel.app` and `VITE_APP_ENV=production` on Vercel; redeploy | Health JSON shows both `keysPresent:true`; password-reset email lands on production `/login` |
| A2 | GitHub Actions CI: install, lint, test, build on every PR | CI green on `main`; failing test blocks merge |
| A3 | Cross-tenant RLS test suite (User A cannot read/write User B's transactions, customers, products) against a local/test Supabase | Tests in CI; fulfils `docs/SECURITY.md` requirement |
| A4 | Single source of truth for migrations: delete the copied folder from the web sync or auto-sync in CI | One canonical `supabase/`; drift check passes |
| A5 | Error monitoring (Sentry or equivalent) + commit the ~28 outstanding modified paths in the monorepo working tree | Server errors visible; `git status` clean |

## Phase B — Public visibility (the tagline)

Public storefront model and pages: `public_slug`, publish flag, public contact channels; `/b/[slug]` public route rendering only explicitly public fields; share links (WhatsApp/web share); verified badge driven by `verification_status`. Exit: an owner can publish/unpublish, an anonymous visitor sees only public fields, RLS tests prove debts/transactions stay private.

## Phase C — Verification and admin

KYC submission (private storage bucket, never the public ones), review queue for `admin` role, decision writes `verification_status`, `audit_events` written via security-definer RPC. Exit: end-to-end submit → review → verified badge; audit trail queryable.

## Phase D — Discovery

Geo capture (lat/lng + area) with consent, category/area search over **published** businesses, distance sorting; map widget only after list discovery works. Exit: a customer can find published businesses by category and area without an account.

## Phase E — Orders and marketplace basics

`orders`/`order_items` on top of products, order intake from the public storefront, owner order inbox converting to sales. Payments provider decision (Paystack/Flutterwave) is a gate. Exit: order placed publicly → appears for owner → converts to a transaction with stock movement.

## Phase F — AI assistance (grounded, server-side)

Nitro AI route implementing `docs/AI_ARCHITECTURE.md`: whitelisted aggregate queries with user JWT, LLM phrases only, confirm-before-write drafts for transactions. Then ChatGPT/Grok translation aid and voice (STT/TTS) on the same confirm-first pattern. Exit: "How much did I sell this week?" answers match dashboard figures exactly in tests.

## Phase G — TIJAR Sense and Google Business Profile

Explicit request intake (text/voice), matching against published businesses, opt-in notifications via `notification_outbox` (email → push → SMS). GBP sync per-owner OAuth for eligible, verified businesses. Exit: a Sense request notifies only opted-in matching businesses; GBP publish verified on one real listing.

---

## Exact first development task (P1-001)

**Title:** Publishable public business profile (schema + RLS + read-only public page)

**Scope (one PR, no AI, no map):**
1. Migration `20260307000010_public_business_profiles.sql`: add `businesses.public_slug text unique`, `businesses.is_public boolean not null default false`, `businesses.public_phone text`, `businesses.public_whatsapp text`; RLS policy: anonymous + authenticated `SELECT` of a business row **only when `is_public = true`** (column-level safety handled by selecting explicit public columns in the query; add a `public_business_profiles` view exposing only name, slug, category, description, location text, logo, public contacts, verification_status).
2. Owner toggle in `src/features/business/`: publish/unpublish + slug editor with uniqueness validation (Zod), using the existing business service.
3. Public route `src/routes/b/$slug.tsx` rendering the view (no auth required), with share button; 404 for unpublished slugs.
4. Tests: Vitest for slug validation; RLS test (from A3 harness) proving anonymous users cannot read unpublished businesses or any transaction/customer rows.

**Why first:** it delivers the product tagline with zero external dependencies, creates the public data surface that discovery (D), Sense (G) and GBP (G) all build on, and forces the public/private boundary to be tested before any AI touches data.

**Not in this task:** geo coordinates, orders, verification workflow, admin UI.

---

## Decisions needed from the product owner before later phases

1. AI provider and budget (Phase F) — no key exists today
2. Translation provider contract: languages, pricing, API access (Phase F)
3. Map provider: OSM/MapLibre vs Google (Phase D)
4. Payments provider for marketplace (Phase E)
5. Whether the Android native mock flow is deleted or kept as an offline demo (recommend: delete after WebView parity is confirmed on a physical device)
