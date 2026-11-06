# TIJAR — Making Every Business Visible

**Voice bookkeeping for African shops**

TIJAR is a web application for African micro and informal businesses — market traders, provision sellers, artisans, and small shops. It helps owners **record sales and expenses**, **manage products and stock**, **learn business basics**, and **become discoverable online**, in the languages they already speak and hear.

| | |
|---|---|
| **Live demo** | [https://tijar-two.vercel.app](https://tijar-two.vercel.app) |
| **Repository** | [https://github.com/musnad/tijar-business-visibility](https://github.com/musnad/tijar-business-visibility) |
| **Stack** | TanStack Start (React + Vite), Supabase, Vercel, Bun |
| **Languages** | English, Hausa, Yoruba, Igbo, Swahili, Nigerian Pidgin |

> **Security:** Never commit API keys, tokens, or passwords. Use `.env.local` (gitignored) and host secrets (e.g. Vercel). Only placeholders belong in `.env.example`.

---

## Table of contents

1. [Problem](#1-problem)
2. [What TIJAR does](#2-what-tijar-does)
3. [Grok (Talk to TIJAR)](#3-grok-talk-to-tijar)
4. [Setup](#4-setup)
5. [Usage](#5-usage)
6. [Architecture & code map](#6-architecture--code-map)
7. [Token usage](#7-token-usage)
8. [Limitations](#8-limitations)
9. [Tests](#9-tests)
10. [Deploy](#10-deploy)
11. [License & contact](#11-license--contact)

---

## 1. Problem

Millions of African micro-businesses operate successfully every day, but software often fails them:

1. **Language** — Owners speak Hausa, Yoruba, Swahili, Pidgin, and more. Most tools are English-only.
2. **Voice first** — Many prefer speaking over typing (busy hands, low literacy, noisy markets). Generic phone speech engines struggle with African languages and accents.
3. **Cross-language trade** — A buyer may enquire in Swahili while the seller’s books and replies are in English or Yoruba.
4. **Visibility without understanding** — A public storefront only helps if descriptions and enquiries can be understood on both sides.

**TIJAR uses Grok** so Talk, translation, and Discover run in African languages — inside the real product workflow.

---

## 2. What TIJAR does

| Area | What the user can do |
|------|----------------------|
| **Talk — My books** | Speak or type a sale/expense → review a draft → **Confirm** to save (no silent writes). Grok understands Hausa, Yoruba, Igbo, Pidgin, and English. |
| **Talk — Two people** | Person A speaks in one language; Person B hears it spoken in another (STT + TTT + TTS). |
| **Translator** | Standalone two-language speak / translate / hear flow. |
| **Products & stock** | Add goods or services (name required; prices accept `₦15,000`, `15k`, etc.), optional photo, opening stock. |
| **Sales & expenses** | Record cash/credit activity; link sales to products for profit. |
| **Scan Document** | Photograph a receipt or handwritten note → on-device OCR → draft → Confirm. |
| **Discover / storefront** | Public `/b/{slug}` pages; translate descriptions and products; voice enquiry. |
| **Learn** | Short lessons with hear/speak practice where supported. |
| **Onboarding** | Typed wizard or voice-assisted business setup. |

---

## 3. Grok (Talk to TIJAR)

- **Server-side only** — The browser never sees `XAI_API_KEY`. Talk, translate, listings, and captions go through TIJAR API routes.
- **No silent writes** — Voice produces a **draft**; the owner must confirm before a sale or expense is saved.
- **Grok first** — Understanding and translation use Grok. Whisper/TTS use OpenAI when configured; the phone speech engine is the fallback.

| TIJAR route | Role |
|-------------|------|
| `POST /api/assistant/chat` | Understand sales/expenses, then a short spoken reply |
| `POST /api/translate` | Text translation (Grok → ChatGPT) |
| `POST /api/speak` | Hear it (OpenAI / personal clone) |
| `POST /api/translate-speech` | Whisper STT |

Deeper notes: [docs/VOICE_LANGUAGE.md](./docs/VOICE_LANGUAGE.md).

---

## 4. Setup

### Requirements

- [Bun](https://bun.sh) (recommended package runner)
- An [xAI](https://console.x.ai) Grok API key (`XAI_API_KEY`)
- Optional: OpenAI key for Whisper/TTS; [Supabase](https://supabase.com) for auth and business data (see [SUPABASE.md](./SUPABASE.md))

### Environment

```sh
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `XAI_API_KEY` | For Talk / translate | **Server-only secret** — never prefix with `VITE_` |
| `OPENAI_API_KEY` | For Whisper / TTS | Server-only |
| `VITE_SUPABASE_URL` | For full app | Public Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | For full app | Public anon / publishable key |
| `VITE_PUBLIC_APP_URL` | Production | Public site URL (no trailing slash) |
| `TRANSLATE_ALLOWED_ORIGINS` | No | Extra allowed Origins for API proxies |

Talk and translation need `XAI_API_KEY`. Auth, books, products, and Discover need Supabase configured and migrations applied.

### Install & run

```sh
git clone https://github.com/musnad/tijar-business-visibility.git
cd tijar-business-visibility
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

- [http://localhost:3000/api/supabase-health](http://localhost:3000/api/supabase-health) — Supabase config  
```sh
bun run test    # unit tests (providers mocked; no live tokens)
bun run build   # production build
```

---

## 5. Usage

### Quick demo walkthrough

1. Open the [live app](https://tijar-two.vercel.app) or run locally.
2. Set language in the top bar (English / Yoruba / Swahili where supported).
3. **Translator** (`/translate`) — choose two languages → Speak → Translate & speak.
4. **Talk** (`/app/assistant`, sign in)  
   - *My books* — say e.g. “I made a sale of 5000 for rice” → review draft → **Confirm & save**.  
   - *Two people* — Person A speaks English; Person B hears Yoruba (or the reverse).
5. **Products** (`/app/products`) — Add product with a name (required); optional `₦` / `15k` prices, stock, photo.
6. **Scan Document** (dashboard quick action / `/app/scan`) — photograph a receipt → review OCR draft → Confirm.
7. **Storefront** — open `/b/{slug}` → Translate description → optional voice enquiry.
8. In DevTools → Network, confirm the browser only calls **your** `/api/translate`, `/api/speak`, `/api/assistant/chat` — never xAI with a client-side key.

### Feature → API map

| Feature | Route | AI |
|---------|-------|-------------|
| Talk — My books | `/app/assistant` | Grok understands the sale/expense |
| Talk — Two people | `/app/assistant` | Grok translate + speak |
| Translator | `/translate` | Grok translate |
| Hear it | throughout | OpenAI TTS, browser fallback |

---

## 6. Architecture & code map

```
Browser  →  TIJAR API routes  →  Grok / OpenAI (server keys)
                ↓
           Supabase (auth, Postgres, storage) when configured
```

| Area | Path |
|------|------|
| Grok client | `src/lib/xai/client.ts` |
| Translate | `src/lib/translation/service.ts` |
| Speech | `src/lib/speech/service.ts` |
| Language catalogue | `src/lib/translation/languages.ts` |
| API routes | `src/routes/api.translate.tsx`, `api.translate-batch.tsx`, `api.speak.tsx`, `api.translate-speech.tsx` |
| Talk UI | `src/features/assistant/assistant-screen.tsx` |
| Translator / Hear it | `src/features/translate/` |
| Products | `src/features/products/` |
| Scan Document | `src/features/scan/`, `src/lib/ocr/` |
| Voice intent (books) | `src/utils/voice-intent.ts` |

---

## 7. Token usage

- Prefer **cached TTT** for repeated UI strings and search queries.
- Cap request size; avoid polling.
- One retry on transient failures.
- Unit tests **mock** the provider so CI does not consume quota.
- Browser speech covers offline fallback when Whisper/TTS is unset.

---

## 8. Limitations

1. **Grok** — Talk and translation need `XAI_API_KEY` on the server (never `VITE_`).
2. **Speech** — Whisper/TTS need `OPENAI_API_KEY`; otherwise the phone speech engine is used.
3. **Browser audio formats** — Mic often records `audio/webm`; if a provider rejects a format, browser STT/TTS fallback applies.
4. **In-memory cache & rate limits** — Per server instance; use Redis / Upstash for multi-region production.
5. **Supabase** — Full books, auth, products, and Discover need a configured project and migrations.
7. **OCR (Scan Document)** — On-device Tesseract (English-oriented); handwritten notes vary in quality — user must always review before save.
8. **Same-language** — TTT rejects same `from` / `to`; the UI speaks the original aloud instead.

---

## 9. Tests

```sh
bun run test
```

Notable suites:

- `src/lib/api/security.test.ts` — proxy origin / JSON / size guards  
- `src/lib/secrets.test.ts` — secret sanitisation  
- `src/utils/voice-intent.test.ts`, `voice-product.test.ts`, `scan-document.test.ts` — books / products / OCR parsing  
- `src/lib/i18n/full-coverage.test.ts` — locale string coverage  

---

## 10. Deploy

See **[DEPLOY.md](./DEPLOY.md)** for Vercel (and alternatives).

Minimum production env:

| Name | Notes |
|------|--------|
| `XAI_API_KEY` | Server secret (Grok) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Embedded at build time |
| `VITE_PUBLIC_APP_URL` | e.g. `https://tijar-two.vercel.app` |
| `VITE_APP_ENV` | `production` |

After changing `VITE_*` variables, **redeploy** so the client bundle picks them up.

---

## 11. License & contact

© 2026 TIJAR.

- xAI Grok: [https://console.x.ai](https://console.x.ai)  

**Do not email or paste live API keys into issues, Discord, pull requests, or this README.**

### Third-party services

| Service | Role |
|---------|------|
| **xAI Grok** | Talk to TIJAR, translation, listings, captions |
| **Supabase** | Auth, Postgres, storage |
| **Vercel** | Hosting |
| **Tesseract.js** | On-device OCR for Scan Document |
| Browser Web Speech API | Fallback STT/TTS |

Talk to TIJAR records sales and expenses with voice. Grok understands the utterance; nothing is saved until Confirm.
