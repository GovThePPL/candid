# Docs

Documentation, API specification, and design references for Candid.

## Structure

```
docs/
├── api.yaml              # OpenAPI 3.0.3 spec (source of truth)
├── candid_app_screens/   # UI mockup screenshots (PNG)
└── debug/                # Debugging artifacts (HAR files, HTML visualizations)
```

## API Specification

`api.yaml` is the **source of truth** for the entire API. Both the backend (Python Flask server) and frontend (JavaScript API client) are generated from it using `openapi-generator-cli`.

- **Swagger UI:** http://localhost:8000/api/v1/ui (when services are running)
- **Backend generation:** `backend/server/build.sh`
- **Frontend generation:** `frontend/regenerate_api.sh`

The spec must accurately describe every field the backend returns. The generated JS client silently drops fields not defined in the spec.

## Screen Mockups

`candid_app_screens/` contains PNG mockups of the app UI: login, cards, chat, stats, profile, moderation, and more. These serve as design references.
