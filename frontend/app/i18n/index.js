import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en_common from './locales/en/common.json'
import en_auth from './locales/en/auth.json'
import en_cards from './locales/en/cards.json'
import en_create from './locales/en/create.json'
import en_settings from './locales/en/settings.json'
import en_chat from './locales/en/chat.json'
import en_stats from './locales/en/stats.json'
import en_moderation from './locales/en/moderation.json'
import en_errors from './locales/en/errors.json'
import es_common from './locales/es/common.json'
import es_auth from './locales/es/auth.json'
import es_cards from './locales/es/cards.json'
import es_create from './locales/es/create.json'
import es_settings from './locales/es/settings.json'
import es_chat from './locales/es/chat.json'
import es_stats from './locales/es/stats.json'
import es_moderation from './locales/es/moderation.json'
import es_errors from './locales/es/errors.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en_common, auth: en_auth, cards: en_cards, create: en_create, settings: en_settings, chat: en_chat, stats: en_stats, moderation: en_moderation, errors: en_errors },
      es: { common: es_common, auth: es_auth, cards: es_cards, create: es_create, settings: es_settings, chat: es_chat, stats: es_stats, moderation: es_moderation, errors: es_errors },
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

export default i18n
