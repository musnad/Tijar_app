# Voice and language

Talk to TIJAR records sales and expenses with voice. Understanding uses **Grok** (`XAI_API_KEY` / `GROK_API_KEY`). Speech in and out uses OpenAI Whisper/TTS when `OPENAI_API_KEY` is set, then the phone’s own speech engine.

| Capability | How |
|---|---|
| Understand a sale/expense | Local parser, then Grok JSON via `POST /api/assistant/chat` |
| Translate | Grok first, ChatGPT fallback via `POST /api/translate` |
| Hear it | `POST /api/speak` (OpenAI / personal clone), browser `speechSynthesis` fallback |
| Mic transcript | Browser speech, then Whisper via `POST /api/translate-speech` |

Hausa, Yoruba, Igbo, Swahili, and Nigerian Pidgin are first-class in Talk and the translator. Nothing is saved until the seller taps Confirm.
