export type SupportedLanguage = {
  code: string;
  shortCode: string;
  name: string;
  nativeName: string;
};

export const SUPPORTED_CHAT_LANGUAGES: SupportedLanguage[] = [
  { code: "en", shortCode: "EN", name: "English", nativeName: "English" },
  { code: "ar", shortCode: "AR", name: "Arabic", nativeName: "العربية" },
  { code: "ru", shortCode: "RU", name: "Russian", nativeName: "Русский" },
  { code: "hi", shortCode: "HI", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ml", shortCode: "ML", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "ta", shortCode: "TA", name: "Tamil", nativeName: "தமிழ்" },
  { code: "ur", shortCode: "UR", name: "Urdu", nativeName: "اردو" },
  { code: "fr", shortCode: "FR", name: "French", nativeName: "Français" },
  { code: "es", shortCode: "ES", name: "Spanish", nativeName: "Español" },
  { code: "de", shortCode: "DE", name: "German", nativeName: "Deutsch" },
  { code: "it", shortCode: "IT", name: "Italian", nativeName: "Italiano" },
  { code: "pt", shortCode: "PT", name: "Portuguese", nativeName: "Português" },
  { code: "tr", shortCode: "TR", name: "Turkish", nativeName: "Türkçe" },
  { code: "zh", shortCode: "ZH", name: "Chinese", nativeName: "中文" },
  { code: "ja", shortCode: "JA", name: "Japanese", nativeName: "日本語" },
  { code: "ko", shortCode: "KO", name: "Korean", nativeName: "한국어" },
];

export const DEFAULT_CHAT_LANGUAGE = SUPPORTED_CHAT_LANGUAGES[0];

export function getSupportedLanguageByCode(code: string | null | undefined) {
  if (!code) {
    return null;
  }

  return (
    SUPPORTED_CHAT_LANGUAGES.find(
      (language) => language.code.toLowerCase() === code.toLowerCase(),
    ) ?? null
  );
}
