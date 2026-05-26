# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run the development server
```powershell
uvicorn main:app --reload
```
API available at `http://localhost:8000`, interactive docs at `http://localhost:8000/docs`.

### Install dependencies
```powershell
pip install -r requirements.txt
```

### Environment setup
Copy `env.example` to `.env` and fill in required values:
- `GEMINI_API_KEY` — Google Gemini API key (required for LLM)
- `JWT_SECRET_KEY` — at least 32 random characters (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, only needed for Google OAuth

When SMTP credentials are omitted, email verification links print to the console (dev convenience).

## Architecture

### Request → Job → Background Pipeline

The core flow for prompt generation is asynchronous:

1. `POST /api/generate` (`api/prompt_router.py`) accepts form data + optional PDF, extracts content via `services/content_extractor.py`, creates a `Job` row with status `PENDING`, then kicks off `workers/pipeline_worker.py` in a **daemon thread** (no Redis/Celery — intentionally simple).
2. The pipeline worker transitions the job through `PENDING → PROCESSING → COMPLETED/FAILED`.
3. The client polls `GET /api/jobs/{job_id}` until status is terminal.

### LLM Pipeline (services/llm_service.py)

The Gemini calls happen in sequence inside `_run_pipeline`:

1. **Build instruction** — formats the form payload into a plain text instruction string.
2. **generate_master_prompt_structure** — single Gemini call (JSON mode, temp=0.3) returning `system_instruction` + `slide_instructions` list.
3. **split_content_to_slides** — another Gemini call (JSON mode, temp=0.2) distributing source content into per-slide excerpts. Content >12 000 chars is recursively summarized first. If slide count >10, the batch is split into two separate calls.
4. **assemble_master_prompt** — pure Python; builds the final `MasterPromptResult` and `full_master_prompt` string that users copy into another AI.

All Gemini calls use `tenacity` retry (3 attempts, exponential back-off). The model is configured via `llm_model` setting (default: `gemini-2.5-flash`).

### Auth System

Two auth paths share the same `users` + `auth_providers` tables:

- **Email/password** — `AuthProvider.provider = LOCAL` stores the Argon2 hash. Registration issues an email-verification token stored directly on the `User` row (no Redis). Login requires `is_email_verified = True`.
- **Google OAuth** — Authlib handles the OAuth dance; `AuthProvider.provider = GOOGLE` stores the Google `sub` ID. On success, an httponly cookie carries the JWT. Linking an existing email account to Google is deliberately blocked to prevent account takeover.

JWT tokens are HS256, created/verified in `core/security.py`. The `get_current_user` dependency in `core/dependencies.py` reads the token from either the `Authorization: Bearer` header or the `access_token` httponly cookie.

Rate limiting for login attempts is in-memory (`utils/rate_limiter.py`) — it does not survive restarts.

### Module Layout

| Directory | Purpose |
|-----------|---------|
| `api/` | HTTP route handlers (`auth_router`, `prompt_router`) |
| `services/` | Business logic — `auth_service`, `llm_service`, `content_extractor`, `email_service`, `description` |
| `workers/` | `pipeline_worker` — daemon thread runner for the generation pipeline |
| `models/` | SQLAlchemy ORM models: `User`, `AuthProvider`, `Job` |
| `schemas/` | Pydantic request/response schemas |
| `database/` | Engine + session factory; auto-detects SQLite vs Postgres from `SQLALCHEMY_DATABASE_URL` |
| `core/` | `security.py` (JWT + passwords), `oauth.py` (Authlib config), `dependencies.py` (FastAPI deps) |
| `utils/` | `config.py` (pydantic-settings singleton), `rate_limiter.py` |

### Database

`database/connection.py` auto-configures `check_same_thread=False` for SQLite or connection pooling for Postgres. Tables are created at startup via `create_tables()` (called in `lifespan`). There are no Alembic migrations wired up yet — schema changes require dropping and recreating the DB in dev.

### Key Limits

- Text input: max 100 000 characters
- PDF: max 10 MB; must be `application/pdf`
- Slides: 3–30 (validated at API level); content splitting batches at >10 slides
- Content passed to Gemini for slide splitting: >12 000 chars triggers recursive summarization (4 000-char chunks)
