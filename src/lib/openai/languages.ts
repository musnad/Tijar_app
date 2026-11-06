/** Languages ChatGPT / Whisper can handle for TIJAR (no server secrets). */
export const OPENAI_LANGUAGES = [
  "English",
  "Yoruba",
  "Hausa",
  "Igbo",
  "Swahili",
  "Nigerian Pidgin",
  "Arabic",
  "Hindi",
  "Chinese",
  "Fulfulde",
] as const;

export type OpenAiLanguage = (typeof OPENAI_LANGUAGES)[number];

export function isOpenAiLanguage(value: string): value is OpenAiLanguage {
  return (OPENAI_LANGUAGES as readonly string[]).includes(value);
}
