# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

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

---

## File Tree

```
backend/
├── main.py                         # FastAPI entry point, lifespan, CORS, router registration
│
├── api/
│   ├── __init__.py
│   ├── auth_router.py              # Auth endpoints: register, verify-email, login, logout,
│   │                               #   /me, Google OAuth dance (/google/login, /google/callback)
│   └── prompt_router.py           # Prompt endpoints:
│                                   #   POST /api/generate-description  (Phase 1, sync)
│                                   #   POST /api/generate              (Phase 2, async)
│                                   #   GET  /api/jobs/{job_id}         (poll status)
│
├── services/
│   ├── __init__.py
│   ├── llm_service.py              # All Gemini calls + master prompt assembly
│   │                               #   generate_design_description()  — Phase 1
│   │                               #   generate_slide_structure()     — Phase 2 B2
│   │                               #   fill_slide_contents()          — Phase 2 B3
│   │                               #   assemble_master_prompt()       — Phase 2 B4
│   │                               #   _build_full_master_prompt()    — string assembler
│   │                               #   _split_batch()                 — batch helper for B3
│   │                               #   _recursive_summarize()         — chunked summarizer
│   ├── auth_service.py             # register, verify_email, login, get_or_create_google_user
│   ├── content_extractor.py        # extract_content() — merges text + PDF into single string
│   └── email_service.py            # send_verification_email() — SMTP or console fallback
│
├── workers/
│   └── pipeline_worker.py          # run_pipeline_in_thread() — daemon thread for Phase 2
│                                   #   _run_pipeline()  — B2 → B3 → B4, updates job in DB
│                                   #   _update_job()    — writes status/result to jobs table
│
├── models/
│   ├── __init__.py
│   ├── user.py                     # User: id(UUID), email, username, is_email_verified,
│   │                               #   email_verification_token, email_verification_expires_at
│   ├── auth_provider.py            # AuthProvider: user_id FK, provider(LOCAL|GOOGLE),
│   │                               #   provider_user_id, hashed_password
│   └── job.py                      # Job: id(UUID), status, input_payload(JSON),
│                                   #   result_payload(JSON), error_message
│
├── schemas/
│   ├── __init__.py
│   ├── prompt.py                   # DescribeRequest, DesignDescription, SlideInstruction,
│   │                               #   MasterPromptResult
│   ├── jobs.py                     # GenerateResponse, JobStatusResponse
│   └── auth.py                     # RegisterRequest, LoginRequest, TokenResponse, UserResponse
│
├── database/
│   ├── __init__.py
│   └── connection.py               # engine, SessionLocal, Base, get_db(), create_tables()
│                                   #   Auto-detects SQLite (check_same_thread=False) vs Postgres
│
├── core/
│   ├── __init__.py
│   ├── security.py                 # create_access_token(), verify_token(), hash_password(),
│   │                               #   verify_password() — Argon2 + HS256 JWT
│   ├── oauth.py                    # Authlib OAuth client config for Google
│   └── dependencies.py            # get_current_user() FastAPI dependency
│                                   #   reads JWT from Bearer header OR access_token httponly cookie
│
└── utils/
    ├── __init__.py
    ├── config.py                   # Settings (pydantic-settings singleton via lru_cache)
    │                               #   Fields: DB URL, Gemini key/model, JWT, Google OAuth,
    │                               #   CORS origins, rate limit, SMTP, email TTL
    └── rate_limiter.py             # In-memory login rate limiter (not Redis; resets on restart)
```

---

## Architecture

### 2-Phase Prompt Generation Flow

Generation is split into two explicit phases so the user can review and edit the AI's design interpretation before the full prompt is built.

```
Phase 1 (sync, ~3–5s)               Phase 2 (async background job)
─────────────────────────────        ────────────────────────────────────
POST /api/generate-description       POST /api/generate
  6 form fields                        6 form fields + description + content/PDF
        ↓                                     ↓
generate_design_description()         B2: generate_slide_structure()
  → DesignDescription JSON                  → list[SlideInstruction]
        ↓                                     ↓
Frontend shows 5 editable fields      B3: fill_slide_contents()
(tone/font/density/etc.)                   → list[SlideInstruction] + content
        ↓                                     ↓
User edits if needed                  B4: assemble_master_prompt()
        ↓                                  → MasterPromptResult
POST /api/generate ─────────────►
  (description included)              Frontend polls GET /api/jobs/{job_id}
```

---

### API Endpoints

| Endpoint | Method | Sync/Async | Purpose |
|---|---|---|---|
| `/api/generate-description` | POST | **Sync** — returns immediately | Phase 1: analyse 6 form fields → DesignDescription |
| `/api/generate` | POST | **Async** — returns `job_id` | Phase 2: full Master Prompt pipeline |
| `/api/jobs/{job_id}` | GET | Sync | Poll job status / retrieve result |
| `/api/auth/register` | POST | Sync | Register new user (email/password) |
| `/api/auth/verify-email` | GET | Sync | Verify email via token in query param |
| `/api/auth/login` | POST | Sync | Login → returns JWT (also sets httponly cookie) |
| `/api/auth/logout` | POST | Sync | Clears access_token cookie |
| `/api/auth/me` | GET | Sync | Get current user info (requires auth) |
| `/api/auth/google/login` | GET | Sync | Redirect to Google OAuth |
| `/api/auth/google/callback` | GET | Sync | Handle Google callback → set JWT cookie |

**`POST /api/generate-description`** — JSON body (`DescribeRequest`), returns `DesignDescription`:
```json
{ "purpose": "...", "audience": "...", "style": "...",
  "primary_layout": "...", "primary_color": "...", "language": "vi" }
```

**`POST /api/generate`** — multipart form (supports PDF upload). Description sent as 5 separate
`desc_*` form fields (`desc_tone`, `desc_font`, `desc_key_message_rule`, `desc_density`, `desc_visual`).
If all 5 are non-empty, the pipeline uses them; otherwise it auto-generates a description.

---

### LLM Pipeline (`services/llm_service.py`)

All Gemini calls use JSON response mode (`response_mime_type="application/json"`) and `tenacity` retry
(3 attempts, exponential back-off 2–10 s). Model configured via `llm_model` setting (default: `gemini-2.5-flash`).

| Function | Phase | Gemini call | temp | Input → Output |
|---|---|---|---|---|
| `generate_design_description()` | 1 | ✓ | 0.3 | 6 form fields → `DesignDescription` |
| `generate_slide_structure()` | 2 B2 | ✓ | 0.3 | purpose/audience/style/layout/slide_count/language → `list[SlideInstruction]` |
| `fill_slide_contents()` | 2 B3 | ✓ (or skip) | 0.2 | `list[SlideInstruction]` + content → slides with content |
| `assemble_master_prompt()` | 2 B4 | ✗ | — | design_description + slides → `MasterPromptResult` |

**`fill_slide_contents()` logic:**
- No content → returns slides unchanged (no Gemini call)
- Content > 12 000 chars → `_recursive_summarize()` chunks at 4 000 chars before calling Gemini
- > 10 slides → two separate `_split_batch()` calls (half each)

**`_build_full_master_prompt()` section order:**
```
[VAI TRÒ / YOUR ROLE]
[NHIỆM VỤ / YOUR TASK]
[CHỈ DẪN / GUIDELINES]      ← guideline_text: natural sentence from all 6 input fields
[MÔ TẢ THIẾT KẾ / DESIGN]  ← desc_text: 5 fields from DesignDescription
[LƯU Ý / NOTE]
[YÊU CẦU FORMAT / FORMAT]
════════════════════════════
[NỘI DUNG TỪNG SLIDE]
  ## Slide N — Title
  INSTRUCTION: ...
  CONTENT: ...
```

---

### guideline_text — Design intent

`guideline_text` (inside `[CHỈ DẪN]`) is the natural-language summary of the user's **6 initial form choices**,
appearing in the final copyable prompt. It should read as one flowing paragraph — not a bulleted list —
so the downstream AI understands context holistically.

**Current (list-style):**
```
Mục đích: {purpose}
Đối tượng người xem: {audience}
Phong cách thiết kế: {style}
```
Primary color and layout are NOT included.

**Target (natural sentence, language-aware, all 6 fields):**
```
# Vietnamese
Mục tiêu của bộ slide là {purpose}, hướng đến đối tượng {audience}
với phong cách thiết kế {style}. Màu sắc chủ đạo là {primary_color}
và layout chính theo dạng {primary_layout}.

# English
The goal of this presentation is {purpose}, targeting {audience}
with a {style} design style. The primary color is {primary_color}
and the main layout follows the {primary_layout} format.
```

To add `primary_color` and `primary_layout` to this section, both parameters must be threaded
through `assemble_master_prompt()` and `_build_full_master_prompt()` (currently they only
reach `generate_slide_structure()` and `generate_design_description()`).

---

### Background Worker (`workers/pipeline_worker.py`)

`run_pipeline_in_thread()` spawns a daemon thread running `_run_pipeline()`.
Each thread opens its **own** SQLAlchemy session (never shares the request session).

**Job lifecycle:** `PENDING → PROCESSING → COMPLETED / FAILED`

- `description` present in payload → used directly as `DesignDescription` (Phase 1 already done)
- `description` absent → worker calls `generate_design_description()` automatically (Phase 1 skipped)

Any unhandled exception in the thread marks the job `FAILED` and stores the error message.

---

### Schemas (`schemas/prompt.py`)

```
DescribeRequest       Phase 1 request body (6 fields: purpose, audience, style,
                      primary_layout, primary_color, language)

DesignDescription     Phase 1 response — 5 AI-generated fields:
                        tone, font, key_message_rule, density, visual
                      Also embedded inside MasterPromptResult.

SlideInstruction      One slide: index(int), title(str), instruction(str), content(str="")

MasterPromptResult    Final job result:
                        master_prompt_title   str
                        design_description    DesignDescription
                        slide_instructions    list[SlideInstruction]
                        total_slides          int
                        full_master_prompt    str   ← the copyable string
```

`design_description` is stored inside `MasterPromptResult` (not just React state) so the
frontend can reconstruct it after a page reload or when viewing a historical job.

---

### Auth System (`api/auth_router.py`, `services/auth_service.py`, `core/`)

Two auth paths share the same `users` + `auth_providers` tables:

| Path | `AuthProvider.provider` | Credential stored |
|---|---|---|
| Email/password | `LOCAL` | Argon2 hash in `auth_providers.hashed_password` |
| Google OAuth | `GOOGLE` | Google `sub` ID in `auth_providers.provider_user_id` |

- Email registration → verification token stored on `User` row (no Redis). Login requires `is_email_verified = True`.
- Google OAuth → Authlib handles the dance. On success, an httponly `access_token` cookie is set.
- Linking an existing email account to Google is deliberately **blocked** to prevent account takeover.
- JWT is HS256, created/verified in `core/security.py`.
- `get_current_user` dependency (`core/dependencies.py`) reads JWT from `Authorization: Bearer` header **or** `access_token` httponly cookie — whichever is present.
- Rate limiting for login is in-memory (`utils/rate_limiter.py`) — **does not survive restarts**.

---

### Database (`database/connection.py`)

- Auto-detects SQLite vs Postgres from `SQLALCHEMY_DATABASE_URL`.
- SQLite adds `check_same_thread=False`; Postgres gets connection pooling.
- Tables created at startup via `create_tables()` in `lifespan` — **no Alembic migrations**.
  Schema changes in dev require dropping and recreating the DB.

**Tables:** `users`, `auth_providers`, `jobs`

---

### Configuration (`utils/config.py`)

`Settings` (pydantic-settings, `.env` file, `lru_cache` singleton). Key groups:

| Group | Key vars |
|---|---|
| Database | `SQLALCHEMY_DATABASE_URL` |
| LLM | `gemini_api_key`, `llm_model` (default `gemini-2.5-flash`), `max_slides_limit` |
| JWT | `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| CORS | `FRONTEND_URL`, `ALLOWED_ORIGINS` |
| Rate limit | `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES` |
| SMTP | `SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL/FROM_NAME` |
| Email | `EMAIL_VERIFY_TTL_HOURS` |

`smtp_enabled` property → `True` only if `SMTP_USER` and `SMTP_PASSWORD` are both set.

---

### Key Limits

| Resource | Limit |
|---|---|
| Text input | max 100 000 chars |
| PDF | max 10 MB, must be `application/pdf` |
| Slide count (API) | 3–30 |
| `fill_slide_contents` batch threshold | > 10 slides → two Gemini calls |
| Gemini content input | > 12 000 chars → recursive summarisation (4 000-char chunks) |
