# TIJAR — Integration Plan (Phase 1 Audit)

> Rule from the audit brief: **no integration is claimed operational until tested end-to-end.** Status column reflects code inspection on 2026-10-21.

## 1. Current integrations (real)

| Integration | Status | Evidence / notes |
|-------------|--------|------------------|
| Supabase Auth (email/password) | **Operational** | Live health `auth.ok:true`; sign-up metadata → `handle_new_user()` profile trigger; reset/onboarding redirects use site URL |
| Supabase Postgres (PostgREST) | **Operational** | All product data via `@supabase/supabase-js` from the browser, RLS-enforced; health returns 20 categories |
| Supabase Storage | **Operational (schema)** | 3 public buckets with member-write policies (migrations 000005–000007); used for product images, logos, avatars |
| Vercel hosting | **Operational** | https://tijar-two.vercel.app serves the app; `vercel.json` framework `tanstack-start` |
| Runtime public-config endpoint | **Operational** | `/api/public-config` supplies public Supabase env when the bundle lacks build-time values |
| Health endpoint | **Operational** | `/api/supabase-health` (auth, DB, env `keysPresent` diagnostics) |
| jsPDF / Recharts / file import | **Operational (client)** | Records export (PDF/CSV), CSV import parser with tests |
| OTP / SMS | **Stub only** | `src/services/otp/dev-otp-provider.ts`; no provider credentials or sender |
| Islamic business guidance | **Content only** | `docs/ISLAMIC_BUSINESS_GUIDANCE.md`, `islamic_mode_enabled` flag; no rules engine beyond health tips |

## 2. Planned integrations (not started)

### 2.1 AI provider ("Ask TIJAR", coaching)
- Design exists in `docs/AI_ARCHITECTURE.md` (grounded prompts, whitelist queries, confirm-before-write). **Zero implementation in web code.**
- Plan: Nitro server route (e.g. `/api/ai/chat`) that (1) authenticates the Supabase JWT, (2) runs whitelisted aggregate queries with the user's JWT (RLS applies), (3) calls the chosen LLM with figures already computed, (4) logs prompt hash + query ids. API key stays server-side (`SUPABASE_SERVICE_ROLE_KEY` discipline applies to the AI key too).
- Provider choice is an open decision (OpenAI / Anthropic / Gemini). Do not embed any key in the client bundle or APK.

### 2.2 African-language translation
- Implemented in `src/lib/translation/*` with server routes (`/api/translate`, `/api/translate-batch`); i18n is static files (en/ha/yo/ig/ar/sw/ff).
- Plan: ChatGPT primary with Grok fallback, caching into message files / a `translations` table; human-review before publishing UI strings.

### 2.3 Voice input / spoken responses
- No speech code anywhere. Plan: Web Speech API first (zero cost, browser support varies) or a server STT/TTS provider; always confirm drafts before writing transactions ("no silent writes", per `docs/AI_ARCHITECTURE.md`).

### 2.4 Google Business Profile (GBP)
- No code or credentials. Eligibility is per-business and requires the business owner's Google account (OAuth), not a single TIJAR key.
- Plan: only after public storefronts exist; OAuth per owner, store refresh tokens server-side (encrypted), sync name/category/location/hours. Treat as a publishing channel, not a source of truth.

### 2.5 Maps & location discovery
- No map library, no geo columns. Plan: add lat/lng capture at onboarding (with consent), start with list + distance sorting before any map widget; evaluate MapLibre/OpenStreetMap vs Google Maps on cost and Nigeria coverage.

### 2.6 Notifications / TIJAR Sense
- No outbox, push, SMS or email jobs. Plan: `notification_outbox` table + a server worker; channels in order email → push (FCM) → SMS (provider TBD). Sense requests must be explicit and opt-in per the product brief; matching runs on public business data only.

### 2.7 Payments (not in current vision statement, required by marketplace)
- No Paystack/Flutterwave code. Defer until orders exist; never handle card data directly.

### 2.8 Error monitoring & analytics
- Only local `error-capture`. Plan: add Sentry (or Vercel Analytics + server logs) before public launch; strip PII/financial figures from events.

## 3. Environment & secrets register

| Variable | Where set | Status |
|----------|-----------|--------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local`, Vercel Production | Set and verified live |
| `VITE_PUBLIC_APP_URL` | `.env.local` | **Missing on Vercel** — set to `https://tijar-two.vercel.app` and redeploy |
| `VITE_APP_ENV` | `.env.local` | **Missing on Vercel** — set `production` |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Not in use; server-only when introduced |
| AI / Maps / SMS keys | — | Do not exist; never invent or commit them |

Security note: the anon key was shared in chat during deployment. It is public-by-design, but rotate it in Supabase if chat exposure is a concern, and update `.env.local` + Vercel together. The service-role key must never appear in chat, client code or the APK.

## 4. Integration sequencing

1. Finish Vercel env (`VITE_PUBLIC_APP_URL`, `VITE_APP_ENV`) — unblocks correct auth emails
2. Monitoring (Sentry) — before any public traffic push
3. Public storefront data (schema in `docs/DATABASE_SCHEMA.md` §7) — no external dependency
4. Geo capture + discovery — map provider decision needed
5. AI server route with one provider — key procurement decision needed
6. AI translation, voice, GBP, Sense — each gated on vendor/eligibility decisions above
