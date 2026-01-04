import { createI18n } from "vue-i18n";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";

function getDefaultLocale(): string {
  const supportedLocales = ["en", "pt", "es"];

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
  messages: { en, pt, es },
});
