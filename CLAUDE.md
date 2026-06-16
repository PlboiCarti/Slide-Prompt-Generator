# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Builder — a web app that helps users build a "Master Prompt" for PowerPoint presentations. Users describe purpose/audience/style (and optionally upload PDF/image content), an AI (Google Gemini) analyzes it, and the system produces a complete prompt that can be pasted into ChatGPT/Claude/Gemini to generate slides.

- **Backend**: Python, FastAPI, SQLAlchemy (SQLite by default), JWT + Google OAuth auth
- **Frontend**: React 18 + TypeScript + Vite, React Router, Axios
- Code, comments, and user-facing error messages are largely in Vietnamese — match that style when editing existing files.

## Development Commands

### Backend (from `backend/`)

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --reload       # http://localhost:8000, Swagger at /docs
```

Requires a `backend/.env` file (see `backend/.env.example`). All settings and defaults are defined in `backend/utils/config.py` (pydantic-settings).

### Frontend (from `frontend/`)

```bash
npm install
npm run dev       # http://localhost:3000 (Vite proxies /api -> http://localhost:8000)
npm run build      # tsc type-check (strict, noUnusedLocals/Parameters) then vite build
npm run preview
```

### Lint / Tests

There is currently no ESLint, Ruff/Flake8, or test suite configured for either project. `npm run build` (tsc strict-mode check) is the closest thing to a frontend lint and will catch type errors and unused locals/parameters — run it after frontend changes. There are no backend tests; verify backend changes by running the server and exercising endpoints via `/docs`.

## Architecture

### Two-phase prompt generation pipeline

1. **Phase 1 — `POST /api/generate-description`** (sync, ~3-5s): Gemini generates a `DesignDescription` (tone, font, key_message_rule, density, visual) from the 6 form fields. Returned directly to the frontend so the user can review/edit it before Phase 2.
2. **Phase 2 — `POST /api/generate`** (async): Creates a `Job` row (status `PENDING`), saves any uploaded files to `backend/uploads/{job_id}/`, and starts a daemon background thread (`workers/pipeline_worker.run_pipeline_in_thread`) — no Redis/queue, intentionally simple for a student project. The frontend polls `GET /api/jobs/{job_id}` every ~3s until status is `COMPLETED` or `FAILED`.

The pipeline worker (`backend/workers/pipeline_worker.py`) runs, in order:
- Extract content from `raw_content` + uploaded files (`services/content_extractor.py` — pypdf for text PDFs, Tesseract OCR via pytesseract + pdf2image/Poppler for scanned PDFs/images, vi+eng languages)
- Use the `DesignDescription` from Phase 1 if provided, else generate one (`services/llm_service.generate_design_description`)
- `generate_slide_structure()` → list of `SlideInstruction`
- `fill_slide_contents()` → fills extracted content into slides (skipped if no content)
- `assemble_master_prompt()` → final `MasterPromptResult`, stored as JSON in `Job.result_payload`

Each pipeline run opens its own DB session (`SessionLocal()`) since it's on a separate thread — never share a request-scoped session with the worker. The `uploads/{job_id}/` directory is deleted once the job finishes (success or failure); `utils/upload_cleanup.py` also sweeps stale upload dirs (>24h) on app startup.

### Job model doubles as drafts/history/bin

`models/job.py` (`Job`) is reused for generation jobs, saved drafts (status `DRAFT`, via `/api/drafts`), history (`/api/history`), and the trash bin (`/api/bin`). Soft-delete sets `deleted_at`; bin deletion is permanent. `services/job_history_service.py` converts `Job` rows to history/bin schemas and enforces ownership checks.

### Auth

- `core/security.py` — Argon2 password hashing, JWT create/decode
- `core/dependencies.get_current_user` — reads JWT from `Authorization: Bearer` header **or** the `access_token` HttpOnly cookie (header takes priority); raises 401/403 accordingly
- `core/oauth.py` — Authlib config for Google OAuth (requires `SessionMiddleware`, registered in `main.py`)
- `services/auth_service.py` — registration, login, email verification, Google login business logic
- Email verification tokens and login/generate rate limiting (`utils/rate_limiter.py`) are **in-memory** — reset on server restart

### File upload validation (`api/prompt_router.py`)

Uploads for `/api/generate` are checked on three levels: extension allow-list (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`), declared `Content-Type` against an allow-list, and magic-byte signature sniffing (`_detect_file_type`) cross-checked against the extension. Max size is `MAX_FILE_SIZE` from `services/content_extractor.py` (10MB). Follow this same multi-check pattern if adding new upload-handling code.

### Backend layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.py` | FastAPI app, CORS, SessionMiddleware, router registration, lifespan (create tables + cleanup uploads) |
| `api/` | Routers: `auth_router`, `prompt_router`, `history_router`, `draft_router` — all mounted under `/api` |
| `core/` | `dependencies.py` (auth dependency), `security.py` (JWT/hashing), `oauth.py` (Google OAuth) |
| `database/connection.py` | SQLAlchemy engine/session/`Base`, auto-detects SQLite vs Postgres |
| `models/` | `User`, `AuthProvider`, `Job` (SQLAlchemy ORM) |
| `schemas/` | Pydantic request/response models |
| `services/` | Business logic: `auth_service`, `content_extractor` (PDF/OCR), `email_service`, `job_history_service`, `llm_service` (Gemini calls) |
| `utils/` | `config.py` (env settings), `rate_limiter.py` (in-memory), `upload_cleanup.py` |
| `workers/pipeline_worker.py` | Background-thread pipeline for Phase 2 |

### Frontend layout (`frontend/src/`)

| Path | Purpose |
|---|---|
| `App.tsx` | Route definitions (React Router) |
| `context/AuthContext.tsx` | Global auth state |
| `components/ProtectedRoute.tsx` | Route guard for authenticated pages |
| `pages/` | `LandingPage`, `LoginPage`, `RegisterPage`, `CallbackPage` (Google OAuth callback), `GeneratePage` (2-phase prompt form), `HistoryPage` (history + bin) |
| `services/api.ts` | Axios instance + typed API namespaces (`authAPI`, `promptAPI`, `historyAPI`, `draftAPI`, `binAPI`); attaches Bearer token from `localStorage` and sends cookies (`withCredentials`) |

`VITE_API_URL` (default `http://localhost:8000/api`) controls the API base URL; in dev, Vite also proxies `/api` to `http://localhost:8000` (see `vite.config.ts`).

## Notes / Current Limitations

- SQLite is the default DB (`prompt_builder.db`); switch to Postgres via `SQLALCHEMY_DATABASE_URL` for concurrent access.
- `JWT_SECRET_KEY` has a `dev_only_*` default — `Settings.check_production_secrets` raises at startup if `ENVIRONMENT=production` and the key still contains `dev_only`.
- When SMTP credentials are empty, email verification links are printed to the console instead of sent (dev mode).
