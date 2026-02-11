# i18n (Internationalization)

i18next-based internationalization with English and Spanish locales.

## Structure

```
i18n/
├── index.js          # i18next init: resources, fallback, namespaces
└── locales/
    ├── en/           # English (source of truth)
    │   ├── common.json       # Shared: buttons, nav, modals
    │   ├── auth.json         # Login, register, setup-profile
    │   ├── cards.json        # All card types
    │   ├── chat.json         # Chat screen
    │   ├── create.json       # Create position, chatting list
    │   ├── settings.json     # All settings sub-pages
    │   ├── moderation.json   # Moderation queue, reports
    │   ├── stats.json        # Stats, opinion map, surveys
    │   ├── admin.json        # Admin panel, roles, pending requests, locations
    │   └── errors.json       # Backend error message translations
    └── es/           # Spanish (must match en/ keys exactly)
        └── (same files)
```

## Usage

```jsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation('cards')  // namespace
  return <Text>{t('agreeLabel')}</Text>
}
```

Cross-namespace: `t('common:retry')`, `t('errors:positionNotFound')`

## Adding a Language

1. Create `locales/<code>/` with all 10 JSON files (copy from `en/`)
2. Add imports and resource entry in `index.js`
3. Add option in `SUPPORTED_LANGUAGES` in `contexts/I18nContext.js`
4. Add display label in `components/LanguagePicker.jsx`

## Backend Error Translation

`translateError(message, t)` in `lib/api.js` maps English backend error strings to i18n keys via reverse lookup from `errors.json`. Falls back to the original message if no mapping exists.
