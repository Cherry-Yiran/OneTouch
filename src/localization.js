export const SUPPORTED_LANGUAGES = Object.freeze(['zh', 'en']);

export function resolveInitialLanguage(savedLanguage, browserLanguages = []) {
  if (SUPPORTED_LANGUAGES.includes(savedLanguage)) return savedLanguage;

  const languages = Array.isArray(browserLanguages)
    ? browserLanguages
    : [browserLanguages];
  return languages.some((language) => String(language).toLowerCase().startsWith('zh'))
    ? 'zh'
    : 'en';
}
