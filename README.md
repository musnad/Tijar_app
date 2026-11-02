# TIJAR — Making Every Business Visible

TIJAR is a web application for African micro and informal businesses — market traders, provision sellers, artisans, and small shops. It helps owners **record sales and expenses**, **manage products and stock**, **learn business basics**, and **become discoverable online**, in the languages they already speak and hear.

| | |
|---|---|
| **Live demo** | [https://tijar-two.vercel.app](https://tijar-two.vercel.app) |
| **Repository** | [https://github.com/musnad/tijar-business-visibility](https://github.com/musnad/tijar-business-visibility) |
| **Stack** | TanStack Start (React + Vite), Supabase, Vercel, Bun |

> **Security:** Never commit API keys, tokens, or passwords. Use `.env.local` (gitignored) and host secrets (e.g. Vercel). Only placeholders belong in `.env.example`.

---

## Table of contents

1. [Problem](#1-problem)
2. [What TIJAR does](#2-what-tijar-does)
3. [AI providers & languages](#3-ai-providers--languages)
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

1. **Language** — Owners speak Hausa, Yoruba, Igbo, Swahili, Fulfulde, Pidgin, Kanuri and more. Most tools are English-only.
2. **Voice first** — Many prefer speaking over typing (busy hands, low literacy, noisy markets). Generic phone speech engines struggle with African languages and accents.
3. **Cross-language trade** — A buyer may enquire in Swahili while the seller’s books and replies are in English or Hausa.
4. **Visibility without understanding** — A public storefront only helps if descriptions and enquiries can be understood on both sides.

**TIJAR uses AI (ChatGPT, Grok, ElevenLabs)** so books, talk, translation, and Discover can run in African languages — inside the real product workflow, not as a detached demo widget.

---

## 2. What TIJAR does

| Area | What the user can do |
|------|----------------------|
| **Talk — My books** | Speak or type a sale/expense → review a draft → **Confirm** to save (no silent writes). Non-English speech is transcribed and translated for understanding. |
| **Talk — Two people** | Person A speaks in one language; Person B hears it spoken in another (STT + translate + TTS). |
| **Translator** | Standalone two-language speak / translate / hear flow. |
| **Products & stock** | Add goods or services (name required; prices accept `₦15,000`, `15k`, etc.), optional photo, opening stock. |
| **Sales & expenses** | Record cash/credit activity; link sales to products for profit. |
| **Scan Document** | Photograph a receipt or handwritten note → on-device OCR → draft → Confirm. |
| **Discover / storefront** | Public `/b/{slug}` pages; translate descriptions and products; voice enquiry. |
| **Learn** | Short lessons with hear/speak practice where supported. |
| **Onboarding** | Typed wizard or voice-assisted business setup. |

---

## 3. AI providers & languages

### Design principles

- **Server-side only** — The browser never sees a provider key. Clients call TIJAR proxies; the server holds `OPENAI_API_KEY`, `XAI_API_KEY`, and `ELEVENLABS_API_KEY`.
- **No silent writes** — Voice and OCR produce **drafts**; the owner must confirm before transactions are saved.
- **Originals preserved** — Translations are shown alongside source text; seller copy is never auto-overwritten without review.
- **Graceful degradation** — If a provider fails, TIJAR falls back (ChatGPT → Grok, ElevenLabs → OpenAI TTS → browser voice).

### Provider routing

| Job | Primary | Fallback | TIJAR proxy |
|-----|---------|----------|-------------|
| Text translation (any pair, incl. Hausa) | ChatGPT (OpenAI) | Grok (xAI) | `POST /api/translate`, `POST /api/translate-batch` |
| Talk / assistant replies | ChatGPT (OpenAI) | Grok (xAI) | `POST /api/assistant/chat` |
| Speak-back (TTS) | ElevenLabs personal voice clone | OpenAI TTS | `POST /api/speak` |
| Speech-to-text | OpenAI Whisper | — | `POST /api/translate-speech` |
| Speech translate | Whisper STT → text translate | — | `POST /api/translate-speech` |

### Languages

The catalog lives in `src/lib/translation/languages.ts` — 40+ African languages with BCP-47 and Whisper codes, ordered with **Hausa first-class** alongside English, Yoruba, Igbo, Nigerian Pidgin, Fulfulde, Kanuri, and many more. Any catalog pair can be translated; the pivot language is English when a provider prefers it.

### Reliability controls

| Control | Behaviour |
|---------|-----------|
| Cache | Successful translations cached in memory (~1 hour) |
| Rate limits | Bound to client IP; higher allowance when signed in (verified JWT) |
| Timeouts / retry | Provider timeout; one retry on transient 5xx |
| Input caps | Text ≤ 1000 characters; voice uploads capped in-app (~5 MB / 60 s) |
| Errors | Stable codes (`NOT_CONFIGURED`, `UNSUPPORTED_LANGUAGE`, `RATE_LIMITED`, …); raw provider bodies never forwarded; keys never logged |

Deeper notes: [docs/VOICE_LANGUAGE.md](./docs/VOICE_LANGUAGE.md).

---

## 4. Setup

### Requirements

- [Bun](https://bun.sh) (recommended package runner)
- An [OpenAI](https://platform.openai.com/api-keys) API key (translation + Whisper STT + TTS)
- Optional: an [xAI](https://console.x.ai) key (Grok translation fallback + media studio)
- Optional: an [ElevenLabs](https://elevenlabs.io) key (personal voice clone for speak-back)
- Optional: [Supabase](https://supabase.com) project for auth and business data (see [SUPABASE.md](./SUPABASE.md))

### Environment

```sh
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | For translation / speech | **Server-only secret** — never prefix with `VITE_`. Powers ChatGPT + Whisper + TTS |
| `XAI_API_KEY` | No | Grok translation fallback + AI Marketing Studio (server-only) |
| `ELEVENLABS_API_KEY` | No | Personal voice clone for speak-back (server-only) |
| `VITE_SUPABASE_URL` | For full app | Public Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | For full app | Public anon / publishable key |
| `VITE_PUBLIC_APP_URL` | Production | Public site URL (no trailing slash) |
| `TRANSLATE_ALLOWED_ORIGINS` | No | Extra allowed Origins for API proxies |

Translation and speech proxies work with **only** `OPENAI_API_KEY` (Grok and ElevenLabs are optional upgrades). Auth, books, products, and Discover need Supabase configured and migrations applied.

### Install & run

```sh
git clone https://github.com/musnad/tijar-business-visibility.git
cd tijar-business-visibility
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

- [http://localhost:3000/api/supabase-health](http://localhost:3000/api/supabase-health) — provider + Supabase config (returns key **fingerprints**, never the keys)

```sh
bun run test    # unit tests (providers mocked; no live tokens)
bun run build   # production build
```

---

## 5. Usage

### Quick demo walkthrough

1. Open the [live app](https://tijar-two.vercel.app) or run locally.
2. Set language in the top bar (English / Hausa / Yoruba / Igbo / Swahili / Fulfulde / Arabic).
3. **Translator** (`/translate`) — choose two languages → Speak → Translate & speak. Confirm the other side hears the AI voice.
4. **Talk** (`/app/assistant`, sign in)  
   - *My books* — say e.g. “I made a sale of 5000 for rice” → review draft → **Confirm & save**.  
   - *Two people* — Person A speaks English; Person B hears Hausa (or the reverse).
5. **Products** (`/app/products`) — Add product with a name (required); optional `₦` / `15k` prices, stock, photo.
6. **Scan Document** (dashboard quick action / `/app/scan`) — photograph a receipt → review OCR draft → Confirm.
7. **Storefront** — open `/b/{slug}` → Translate description → optional voice enquiry.
8. In DevTools → Network, confirm the browser only calls **your** `/api/translate`, `/api/speak`, `/api/translate-speech` — never a provider with a client-side key.

### Feature → API map

| Feature | Route | AI surface |
|---------|-------|------------|
| Talk — My books | `/app/assistant` | Whisper STT → intent; translate when non-English; TTS replies |
| Talk — Two people | `/app/assistant` | STT + translate + TTS |
| Translator | `/translate` | STT + translate + TTS |
| Discover / storefront | `/discover`, `/b/{slug}` | Translate; STT for voice enquiry |
| Hear it | throughout | TTS (ElevenLabs / OpenAI first, browser fallback) |
| Admin string translate | `/app/admin/translate` | Batch translation (signed-in) |

---

## 6. Architecture & code map

```
Browser  →  TIJAR API routes  →  ChatGPT (OpenAI) / Grok (xAI) / ElevenLabs
                ↓
           Supabase (auth, Postgres, storage) when configured
```

| Area | Path |
|------|------|
| Translation orchestrator (ChatGPT → Grok) | `src/lib/translation/service.ts` |
| Speech orchestrator (ElevenLabs clone → OpenAI TTS, Whisper STT) | `src/lib/translation/speech.ts` |
| African-language catalog | `src/lib/translation/languages.ts` |
| Provider adapters | `src/lib/translation/provider.ts` |
| Proxy security / rate limit | `src/lib/api/security.ts`, `src/lib/api/rate-limit.ts` |
| API routes | `src/routes/api.translate.tsx`, `api.translate-batch.tsx`, `api.speak.tsx`, `api.translate-speech.tsx` |
| Talk UI | `src/features/assistant/assistant-screen.tsx` |
| Translator / Hear it | `src/features/translate/` |
| Products | `src/features/products/` |
| Scan Document | `src/features/scan/`, `src/lib/ocr/` |
| Voice intent (books) | `src/utils/voice-intent.ts` |

---

## 7. Token usage

- Prefer **cached translations** for repeated UI strings and search queries.
- Cap request size; avoid polling.
- One retry on transient failures.
- Unit tests **mock** the providers so CI does not consume quota.
- Browser speech engines cover offline fallback so demos still work if a provider is unavailable.

---

## 8. Limitations

1. **Model quality varies by language** — African-language translation and voice quality depend on the provider model; the browser speech engine is the offline fallback.
2. **Non-direct pairs** — Some pairs are more reliable when pivoted via English; TIJAR caches each leg.
3. **Browser audio formats** — Mic often records `audio/webm`; if a provider rejects a format, browser STT/TTS fallback applies.
4. **In-memory cache & rate limits** — Per server instance (suitable for single-region); use Redis / Upstash for multi-region production.
5. **Supabase** — Full books, auth, products, and Discover need a configured project and migrations. The AI proxies alone need only `OPENAI_API_KEY`.
6. **OCR (Scan Document)** — On-device Tesseract (English-oriented); handwritten notes vary in quality — user must always review before save.
7. **Same-language** — Translation is skipped for identical `from` / `to`; the UI speaks the original aloud instead.

---

## 9. Tests

```sh
bun run test
```

Notable suites:

- `src/lib/translation/*` — provider routing, language catalog, speech orchestration
- `src/utils/voice-intent.test.ts`, `voice-product.test.ts`, `scan-document.test.ts` — books / products / OCR parsing  
- `src/lib/i18n/full-coverage.test.ts` — locale string coverage  

---

## 10. Deploy

See **[DEPLOY.md](./DEPLOY.md)** for Vercel (and alternatives).

Minimum production env:

| Name | Notes |
|------|--------|
| `OPENAI_API_KEY` | Server secret (translation + speech) |
| `XAI_API_KEY` / `ELEVENLABS_API_KEY` | Optional providers (server secrets) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Embedded at build time |
| `VITE_PUBLIC_APP_URL` | e.g. `https://tijar-two.vercel.app` |
| `VITE_APP_ENV` | `production` |

After changing `VITE_*` variables, **redeploy** so the client bundle picks them up.

---

## 11. License & contact

© 2026 TIJAR.

**Do not email or paste live API keys into issues, Discord, pull requests, or this README.**

### Third-party services

| Service | Role |
|---------|------|
| **ChatGPT (OpenAI)** | Text translation, Whisper STT, TTS |
| **Grok (xAI)** | Translation fallback, AI Marketing Studio |
| **ElevenLabs** | Personal voice clone for speak-back |
| **Supabase** | Auth, Postgres, storage |
| **Vercel** | Hosting |
| **Tesseract.js** | On-device OCR for Scan Document |
| Browser Web Speech API | Fallback STT/TTS |
