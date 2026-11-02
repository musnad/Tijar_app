# TIJAR — Product Specification (Phase 1 Audit)

> Tagline: **Making Every Business Visible.**
> Status: reflects the repository as audited on 2026-10-21. No features were implemented as part of this audit.
> Companion docs: `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/INTEGRATION_PLAN.md`, `docs/IMPLEMENTATION_ROADMAP.md`.

## 1. Product vision (target, not current state)

An AI-assisted business operating system and local commerce platform for African micro, small and medium-sized businesses:

- AI-assisted registration and onboarding
- Digital business profiles and shareable storefronts
- TIJAR map and local marketplace with location-based discovery
- AI business management: sales, expenses, stock, orders, customers
- African-language translation (ChatGPT primary, Grok fallback), voice input and spoken responses
- AI business education and coaching
- Google Business Profile integration where eligible and supported
- TIJAR Sense: explicit voice/text requests, nearby business matching, opt-in notifications
- Admin moderation, business verification status, audit logs

## 2. What the product actually is today

Two clients share **one Supabase backend**:

| Surface | Reality |
|---------|---------|
| Web app (`tijar-business-visibility/`) | Marketing site + a working business-record product under `/app/*` |
| Android app (`app/`) | WebView shell that loads the web app; falls back to native mock screens if no web URL is configured |
| Backend | Supabase only (Auth + Postgres + Storage). No custom API server except two health/config routes |

### 2.1 Implemented user-facing features (web `/app`)

- Auth: email/password sign-up, sign-in, password reset (`/login`, `/register`, plus app-styled `/app/login`, `/app/register`)
- Onboarding wizard that creates a profile + business + Business DNA
- Dashboard: period sales/expenses/profit, health insights, credit summary, recent transactions
- Record sale / expense / purchase / customer payment / supplier payment
- Products with stock levels, low-stock thresholds, stock adjustment, product images, per-sale profit
- Customers and suppliers with credit balances (DB triggers maintain balances)
- Transactions list, records import (CSV/file parse) and export (including PDF via jsPDF)
- Learn hub: lesson catalogue in code, XP, streaks, hearts; progress persisted per user
- Business settings (incl. logo), profile settings (incl. avatar), account deletion (RPC)
- Rules-based business health score and recommendations (no LLM)
- Marketing pages: home, About, How It Works, Learn, Business Visibility, Contact, Privacy, Terms
- i18n message files: English, Hausa, Yoruba, Igbo, Arabic, Kiswahili, Fulfulde (coverage varies; learn content is English-first)

### 2.2 Vision features that do NOT exist yet

| Vision item | Status in repo |
|-------------|---------------|
| AI assistant / "Ask TIJAR" | Design doc only (`docs/AI_ARCHITECTURE.md`). Android has a mock AI screen; web has no AI code |
| Public storefronts | No public profile route. `/business-visibility` is a marketing page with a hard-coded example |
| TIJAR map / marketplace / discovery | Absent. `businesses.location` is free text; no latitude/longitude anywhere |
| Orders | No orders model; sales are recorded as `transactions` only |
| African-language translation | Implemented in `src/lib/translation/*` (ChatGPT primary, Grok fallback); i18n is static message files |
| Voice input / spoken responses | Absent (no speech code in web) |
| Google Business Profile | Absent |
| TIJAR Sense / notifications | Absent; no notification outbox, push, SMS or email jobs |
| KYC / verification workflow | Only a `verification_status` enum + badge display; no submission, review, or documents flow |
| Admin moderation | `platform_roles` table exists; no admin UI and no moderation queue |
| Audit-log UI | `audit_events` table exists; application code never writes to it (`business_events` is written) |

## 3. Users and roles (as enforced today)

- **Business owner** (`business_members.role = owner`): full access to their business data
- **Staff** (`role = staff`): membership exists; permission matrix (`permissions` jsonb) is not yet enforced in UI
- **Platform roles** (`admin`, `content_manager`, `shariah_reviewer`): table + helper function exist; no UI consumes them
- **Anonymous visitor**: marketing pages and public storage reads only

## 4. Core domain objects (current)

Profile, Business, BusinessDNA, BusinessCategory, Customer, Supplier, Transaction, Product, StockMovement, BusinessHealthSnapshot, BusinessRecommendation, UserLearnState, UserLessonCompletion. Full detail in `docs/DATABASE_SCHEMA.md`.

## 5. Non-goals for the next phase

- No framework replacement and no rebuild (audit constraint)
- No claim that any AI, map, marketplace, GBP or notification integration works until it is tested end-to-end (see `docs/INTEGRATION_PLAN.md`)

## 6. Success criteria for the product direction

The current product proves **record-keeping**. The tagline ("Making Every Business Visible") is not yet delivered: a business cannot be publicly discovered. The roadmap therefore sequences **public visibility first, then discovery, then AI** on top of records that already exist.
