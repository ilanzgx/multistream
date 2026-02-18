import {
  BrazilFlagIcon,
  ChinaFlagIcon,
  GermanyFlagIcon,
  RussiaFlagIcon,
  SpainFlagIcon,
  UnitedStatesFlagIcon,
} from "@/components/icons/flags";
import type { Component } from "vue";

export interface LanguageConfig {
  code: string;
  label: string;
  name: string;
  flag: Component;
  apiCodes: {
    twitch: string;
    kick: { code: string; name: string };
  };
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  en: {
    code: "en",
    label: "EN",
    name: "English",
    flag: UnitedStatesFlagIcon,
    apiCodes: {
      twitch: "EN",
      kick: { code: "en", name: "English" },
    },
  },
  pt: {
    code: "pt",
    label: "PT",
    name: "Português",
    flag: BrazilFlagIcon,
    apiCodes: {
      twitch: "PT",
      kick: { code: "pt", name: "Portuguese" },
    },
  },
  es: {
    code: "es",
    label: "ES",
    name: "Español",
    flag: SpainFlagIcon,
    apiCodes: {
      twitch: "ES",
      kick: { code: "es", name: "Spanish" },
    },
  },
  de: {
    code: "de",
    label: "DE",
    name: "Deutsch",
    flag: GermanyFlagIcon,
    apiCodes: {
      twitch: "DE",
      kick: { code: "de", name: "German" },
    },
  },
  cn: {
    code: "cn",
    label: "CN",
    name: "简体中文",
    flag: ChinaFlagIcon,
    apiCodes: {
      twitch: "ZH",
      kick: { code: "zh", name: "Chinese" },
    },
  },
  ru: {
    code: "ru",
    label: "RU",
    name: "Русский",
    flag: RussiaFlagIcon,
    apiCodes: {
      twitch: "RU",
      kick: { code: "ru", name: "Russian" },
    },
  },
};

export const DEFAULT_LOCALE = "en";
