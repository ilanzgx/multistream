import { createI18n } from "vue-i18n";
import { en, pt, es, de, cn, ru } from "@/i18n/locales";

function getDefaultLocale(): string {
  const supportedLocales = ["en", "pt", "es", "de", "cn", "ru"];

  const savedLocale = localStorage.getItem("locale");
  if (savedLocale && supportedLocales.includes(savedLocale)) {
    return savedLocale;
  }

  const browserLang = navigator.language?.split("-")[0] ?? "en";
  return supportedLocales.includes(browserLang) ? browserLang : "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: "en",
  messages: { en, pt, es, de, cn, ru },
});
