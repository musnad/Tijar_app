# Phase 5 — Voice & African-Language Support: Status Report

Honest capability matrix. Unit tests use mocked provider responses.

## Provider stack

| Job | Primary | Fallback |
|-----|---------|----------|
| Text translation (any catalog pair) | ChatGPT (OpenAI) | Grok (xAI) |
| Talk / assistant replies | ChatGPT (OpenAI) | Grok (xAI) |
| Speech-to-text | OpenAI Whisper | — |
| Speak-back (TTS) | ElevenLabs personal voice clone | OpenAI TTS |

| Question | Answer |
|----------|--------|
| Text translate | `POST /api/translate`, `POST /api/translate-batch` → ChatGPT, Grok on failure |
| TTS | `POST /api/speak` → ElevenLabs clone, OpenAI TTS fallback |
| STT | `POST /api/translate-speech` → OpenAI Whisper |
| Speech translate | Whisper STT → text translate in one call |
| Auth | Server-only API keys — the browser never sees a provider key |
| Languages | All 41 languages in `src/lib/translation/languages.ts` (Hausa first-class) |

## What is genuinely implemented

| Capability | How | Languages | Tested |
|------------|-----|-----------|--------|
| Text translation | `/api/translate` | Any catalog pair (including Hausa) | Mocked |
| Batch translation | `/api/translate-batch` | Same | Mocked |
| Speech-to-text | Whisper via `/api/translate-speech` (MediaRecorder), browser Web Speech fallback | Catalog languages + browser | Mocked |
| Text-to-speech | ElevenLabs clone via `/api/speak`, OpenAI TTS then browser `speechSynthesis` | Catalog languages + browser | Mocked |
| Voice records | Talk → draft → Confirm | Same | Parser tests |
| Conversation translator | `/translate` + speak-back | Same | UI + services |

## Not supported / not claimed

- Provider voice quality for every catalog language varies; the browser speech engine remains the offline fallback.
- Translation quality depends on the underlying model; originals are always shown alongside the translation.

## Privacy

Audio is uploaded only after an explicit record/mic press (≤5 MB / ~60 s), never logged, and only to TIJAR’s server which proxies to the providers with server-side keys. Transcripts are shown for review before save/send where the UI requires it.
