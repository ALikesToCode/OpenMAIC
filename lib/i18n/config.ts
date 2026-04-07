import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { supportedLocales } from './locales';
import enUS from './locales/en-US.json';
import jaJP from './locales/ja-JP.json';
import ruRU from './locales/ru-RU.json';
import zhCN from './locales/zh-CN.json';
import { defaultLocale } from './types';

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
  'ja-JP': { translation: jaJP },
  'ru-RU': { translation: ruRU },
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales.map((l) => l.code),
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
