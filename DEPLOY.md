# Deploy TIJAR online (same as local)

Local dev uses `bun run dev`. Production uses the **same code** after `bun run build`.

## 1. Environment variables (required at **build** time)

Set these on your host **before** `bun run build` (Vite embeds `VITE_*` into the bundle):

| Variable | Example |
|----------|---------|
| `VITE_SUPABASE_URL` | `https://ongsfahnfknqelyhuxrt.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your publishable / anon key |
| `VITE_PUBLIC_APP_URL` | `https://your-domain.com` (no trailing slash) |
| `VITE_APP_ENV` | `production` |

Copy from `.env.example` → set in hosting UI (Vercel, Railway, Render, etc.).

**Never** set `SUPABASE_SERVICE_ROLE_KEY` in the browser bundle.

### Vercel (production: [tijar-two.vercel.app](https://tijar-two.vercel.app))

1. [Vercel Dashboard](https://vercel.com) → your **tijar** project → **Settings → Environment Variables**.
2. Add for **Production** (and Preview if you want PR previews to work):

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | Same as in your local `.env.local` |
   | `VITE_SUPABASE_ANON_KEY` | Same anon/publishable key as local |
   | `VITE_PUBLIC_APP_URL` | `https://www.tijar.ng` |
   | `VITE_APP_ENV` | `production` |
   | `OPENAI_API_KEY` | `sk-…` from OpenAI (server-only; powers translate + voice AI) |
   | `ELEVENLABS_API_KEY` | `sk_…` from ElevenLabs (personal voice clone for speak-back) |
   | `XAI_API_KEY` | `xai-…` from xAI Grok (translation fallback + media studio; optional) |

3. **Deployments** → ⋮ on latest → **Redeploy** (must rebuild so Vite picks up `VITE_*`).

4. Confirm: [https://tijar-two.vercel.app/api/supabase-health](https://tijar-two.vercel.app/api/supabase-health) shows `"supabaseConfigured": true` and `"auth": { "ok": true }`. If still false, check `"keysPresent"` in the JSON — each `VITE_*` name should be `true` after redeploy.

**Exact values for this project:**

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://ongsfahnfknqelyhuxrt.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your anon JWT or `sb_publishable_…` key from Supabase → Settings → API |
| `VITE_PUBLIC_APP_URL` | `https://tijar-two.vercel.app` |
| `VITE_APP_ENV` | `production` |

Repo includes `vercel.json` with `"framework": "tanstack-start"` per [Vercel’s TanStack Start guide](https://vercel.com/docs/frameworks/full-stack/tanstack-start).

## 2. Supabase Auth URLs

In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication → URL configuration**:

- **Site URL:** `https://www.tijar.ng`
- **Redirect URLs:** add  
  `https://www.tijar.ng/auth/callback`  
  `https://www.tijar.ng/reset-password`  
  `https://www.tijar.ng/**`  
  `https://tijar.ng/**`  
  `http://localhost:3000/**` (for local dev)

## 3. Database

Apply migrations — see [SUPABASE.md](./SUPABASE.md) (`supabase db push` or SQL Editor).

## 4. Build & run

```bash
bun install
bun run build
bun run start
```

Or Docker:

```bash
docker build -t tijar-web .
docker run -p 3000:3000 tijar-web
```

Preview production locally (uses `.env.local` if present):

```bash
bun run build
bun run preview:prod
```

## 5. Verify

Open:

- `https://your-domain.com/api/supabase-health` → `auth.ok` and `database.ok`
- `https://your-domain.com/login` → sign in → `/app` dashboard

## 6. Android app

Set `VITE_PUBLIC_APP_URL=https://your-domain.com` before building the APK, or `webAppUrl` in `local.properties`, then `./scripts/build-apk.sh`.

The app loads your **online** site — same Supabase data as the website.
