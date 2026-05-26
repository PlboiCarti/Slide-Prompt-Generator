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

### 2-Phase Prompt Generation Flow

Generation is split into two explicit phases so the user can review and edit the AI's design interpretation before the full prompt is built.

```
Phase 1 (sync, ~3–5s)            Phase 2 (async background job)
──────────────────────────        ──────────────────────────────────────
POST /api/generate-description    POST /api/generate
  6 form fields                     6 form fields + description + content/PDF
       ↓                                    ↓
generate_design_description()       B2: generate_slide_structure()
  → DesignDescription JSON               → list[SlideInstruction]
       ↓                                    ↓
Frontend displays 5 editable        B3: fill_slide_contents()
fields (tone/font/density/etc.)          → list[SlideInstruction] + content
       ↓                                    ↓
User edits if needed                B4: assemble_master_prompt()
       ↓                                 → MasterPromptResult
POST /api/generate ──────────────►
  (description included)           Frontend polls GET /api/jobs/{job_id}
```

### API Endpoints

| Endpoint | Method | Sync/Async | Purpose |
|---|---|---|---|
| `/api/generate-description` | POST | **Sync** — returns immediately | Phase 1: analyse form fields → design description |
| `/api/generate` | POST | **Async** — returns `job_id` | Phase 2: build full Master Prompt |
| `/api/jobs/{job_id}` | GET | Sync | Poll job status / retrieve result |

**`POST /api/generate-description`** — JSON body (`DescribeRequest`), returns `DesignDescription`:
```json
{ "purpose": "...", "audience": "...", "style": "...",
  "primary_layout": "...", "primary_color": "...", "language": "vi" }
```

**`POST /api/generate`** — multipart form (supports PDF upload). Key field: `description` passed as a JSON string containing the (possibly user-edited) `DesignDescription`. If omitted, the pipeline auto-generates one inside the background job (user cannot review it).

### LLM Pipeline (`services/llm_service.py`)

All Gemini calls use JSON response mode and `tenacity` retry (3 attempts, exponential back-off). Model configured via `llm_model` setting (default: `gemini-2.5-flash`).

| Function | Phase | Gemini call | Input → Output |
|---|---|---|---|
| `generate_design_description()` | 1 | Yes (temp=0.3) | 6 form fields → `DesignDescription` |
| `generate_slide_structure()` | 2 B2 | Yes (temp=0.3) | purpose/audience/style/layout/slide_count → `list[SlideInstruction]` (validated immediately, never passed as raw `list[dict]`) |
| `fill_slide_contents()` | 2 B3 | Yes (temp=0.2) | `list[SlideInstruction]` + content → `list[SlideInstruction]` with content filled |
| `assemble_master_prompt()` | 2 B4 | No | purpose/audience/style + `DesignDescription` + slides → `MasterPromptResult` |

`fill_slide_contents()` skips the Gemini call entirely if no source content is provided. Content >12 000 chars is recursively summarised first (4 000-char chunks). Slide count >10 splits into two separate Gemini calls.

`_build_full_master_prompt()` assembles the copyable prompt string in this section order:
`[VAI TRÒ] → [NHIỆM VỤ] → [CHỈ DẪN] → [MÔ TẢ THIẾT KẾ] → [FORMAT] → [NỘI DUNG TỪNG SLIDE]`

### Background Worker (`workers/pipeline_worker.py`)

`run_pipeline_in_thread()` spawns a daemon thread that runs `_run_pipeline()`. Each thread opens its own SQLAlchemy session (never shares the request session). Job lifecycle: `PENDING → PROCESSING → COMPLETED / FAILED`. Any unhandled exception marks the job `FAILED`.

If `description` is present in the payload, the worker uses it directly as `DesignDescription`. If absent (Phase 1 was skipped), the worker calls `generate_design_description()` automatically before B2.

### Schemas (`schemas/prompt.py`)

```
DescribeRequest      → Phase 1 request body
DesignDescription    → Phase 1 response; also embedded in MasterPromptResult
SlideInstruction     → one slide: index, title, instruction, content
MasterPromptResult   → final job result:
    master_prompt_title   str
    design_description    DesignDescription   ← lets frontend re-display even after page refresh
    slide_instructions    list[SlideInstruction]
    total_slides          int
    full_master_prompt    str                 ← the string users copy into another AI
```

`design_description` is included in `MasterPromptResult` (not just kept in React state) so the frontend can reconstruct it after a page reload or when viewing historical job results.

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
| `services/` | Business logic — `auth_service`, `llm_service`, `content_extractor`, `email_service` |
| `workers/` | `pipeline_worker` — daemon thread runner for Phase 2 |
| `models/` | SQLAlchemy ORM models: `User`, `AuthProvider`, `Job` |
| `schemas/` | Pydantic schemas — `prompt.py`, `jobs.py`, `auth.py` |
| `database/` | Engine + session factory; auto-detects SQLite vs Postgres from `SQLALCHEMY_DATABASE_URL` |
| `core/` | `security.py` (JWT + passwords), `oauth.py` (Authlib config), `dependencies.py` (FastAPI deps) |
| `utils/` | `config.py` (pydantic-settings singleton), `rate_limiter.py` |

### Database

`database/connection.py` auto-configures `check_same_thread=False` for SQLite or connection pooling for Postgres. Tables are created at startup via `create_tables()` (called in `lifespan`). There are no Alembic migrations wired up yet — schema changes require dropping and recreating the DB in dev.

### Key Limits

- Text input: max 100 000 characters
- PDF: max 10 MB; must be `application/pdf`
- Slides: 3–30 (validated at API level); `fill_slide_contents` batches at >10 slides
- Source content passed to Gemini: >12 000 chars triggers recursive summarisation (4 000-char chunks)
