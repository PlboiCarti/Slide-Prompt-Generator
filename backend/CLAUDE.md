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

### Run frontend (Vite + React)
```powershell
cd ../frontend && npm run dev
```
Frontend available at `http://localhost:3000`.

### Environment setup
Copy `env.example` to `.env` and fill in required values:
- `gemini_api_key` — Google Gemini API key (required for LLM)
- `JWT_SECRET_KEY` — at least 32 random characters (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, only needed for Google OAuth

When SMTP credentials are omitted, email verification links are logged to console (dev convenience).

---

## File Tree

### Backend (`backend/`)

```
backend/
├── main.py                         # FastAPI entry point, lifespan, CORS + Session middleware,
│                                   #   router registration (/api prefix for both routers)
│
├── api/
│   ├── auth_router.py              # Auth endpoints (prefix /auth, tag Authentication):
│   │                               #   POST /auth/register
│   │                               #   POST /auth/login
│   │                               #   GET  /auth/verify-email?token=...
│   │                               #   GET  /auth/google          ← Google OAuth start
│   │                               #   GET  /auth/google/callback ← Google OAuth callback
│   │                               #   GET  /auth/me
│   │                               #   POST /auth/logout
│   └── prompt_router.py            # Prompt endpoints (no prefix, tag Prompt Generation):
│                                   #   POST /generate-description  (Phase 1, sync)
│                                   #   POST /generate              (Phase 2, async → job_id)
│                                   #   GET  /jobs/{job_id}         (poll status)
│
├── services/
│   ├── llm_service.py              # All Gemini calls + master prompt assembly
│   │                               #   generate_design_description()  — Phase 1
│   │                               #   generate_slide_structure()     — Phase 2 B2
│   │                               #   fill_slide_contents()          — Phase 2 B3
│   │                               #   assemble_master_prompt()       — Phase 2 B4
│   │                               #   _build_full_master_prompt()    — string assembler
│   │                               #   _split_batch()                 — batch helper for B3
│   │                               #   _recursive_summarize()         — chunked summarizer
│   │                               #   _safe_parse()                  — strips code fence, parse JSON
│   │                               #   _timed()                       — context manager log timing
│   ├── auth_service.py             # AuthService class:
│   │                               #   register_with_email()
│   │                               #   verify_email()
│   │                               #   login_with_email()
│   │                               #   login_or_register_with_google()
│   ├── content_extractor.py        # extract_content() — merges text + PDF → single string
│   │                               #   _validate_pdf_file(), _extract_pdf() (uses pypdf)
│   └── email_service.py            # send_verification_email() — SMTP or console fallback
│
├── workers/
│   └── pipeline_worker.py          # run_pipeline_in_thread() — spawns daemon thread
│                                   #   _run_pipeline()  — B2 → B3 → B4, updates job in DB
│                                   #   _update_job()    — writes status/result to jobs table
│
├── models/
│   ├── user.py                     # User: id(UUID str), email, username(nullable),
│   │                               #   is_email_verified, is_active,
│   │                               #   email_verification_token, email_verification_expires_at,
│   │                               #   created_at, updated_at
│   │                               #   relationship → auth_providers (cascade delete)
│   ├── auth_provider.py            # AuthProvider: id, user_id(FK), provider(ProviderType enum),
│   │                               #   provider_user_id(nullable), password_hash(nullable),
│   │                               #   created_at
│   │                               #   ProviderType enum: LOCAL="local", GOOGLE="google"
│   └── job.py                      # Job: id(UUID str 36), status, input_payload(Text JSON),
│                                   #   result_payload(Text JSON nullable), error_message(nullable),
│                                   #   created_at, updated_at
│                                   #   properties: input_dict, output_dict
│
├── schemas/
│   ├── prompt.py                   # DescribeRequest, DesignDescription, SlideInstruction,
│   │                               #   MasterPromptResult
│   ├── jobs.py                     # JobStatus(enum), GenerateResponse, JobStatusResponse
│   └── auth.py                     # UserRegister, UserLogin, EmailVerifyRequest (inputs)
│                                   #   UserResponse, TokenResponse, MessageResponse (outputs)
│
├── database/
│   └── connection.py               # engine, SessionLocal, Base, get_db(), create_tables()
│                                   #   Auto-detects SQLite (check_same_thread=False) vs Postgres
│                                   #   SQLite: echo=is_development; Postgres: pool_pre_ping, pool_recycle
│
├── core/
│   ├── security.py                 # hash_password(), verify_password() — pwdlib PasswordHash.recommended()
│   │                               #   create_access_token(), decode_token() — HS256 JWT
│   │                               #   generate_email_verification_token() — secrets.token_urlsafe(32)
│   ├── oauth.py                    # Authlib OAuth singleton, registers Google provider
│   │                               #   scope: openid email profile
│   └── dependencies.py             # get_current_user() — reads Bearer header OR access_token cookie
│                                   #   get_current_verified_user() — strict: requires is_email_verified
│
└── utils/
    ├── config.py                   # Settings (pydantic-settings, lru_cache singleton)
    │                               #   smtp_enabled property, is_production property,
    │                               #   is_development property, get_allowed_origins()
    └── rate_limiter.py             # LoginAttemptTracker class (thread-safe, in-memory)
                                    #   login_tracker singleton
                                    #   record_failed_attempt(), is_locked(), reset(), get_attempts()
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── App.tsx                     # Router: /login, /register, /auth/callback,
│   │                               #   /generate (ProtectedRoute), / → redirect /generate
│   ├── main.tsx                    # Vite entry point
│   ├── index.css                   # Global styles
│   ├── vite-env.d.ts
│   │
│   ├── context/
│   │   └── AuthContext.tsx         # AuthProvider, useAuth() hook — user state + token management
│   │
│   ├── components/
│   │   └── ProtectedRoute.tsx      # Redirect to /login if not authenticated
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx           # Email/password login + Google OAuth button
│   │   ├── RegisterPage.tsx        # Email/password registration
│   │   ├── CallbackPage.tsx        # Handles /auth/callback after Google OAuth redirect
│   │   ├── GeneratePage.tsx        # Main app: 2-phase form + result display
│   │   ├── AuthPage.css
│   │   └── GeneratePage.css
│   │
│   └── services/
│       └── api.ts                  # axios instance (withCredentials: true)
│                                   #   authAPI: register, login, verifyEmail, getMe, logout, googleLoginUrl
│                                   #   promptAPI: generateDescription (Phase 1), generate (Phase 2), getJobStatus
│                                   #   Types: LoginPayload, RegisterPayload, DesignDescription,
│                                   #          DescribePayload, GeneratePayload
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── .env                            # VITE_API_URL=http://localhost:8000/api
```

---

## Architecture

### 2-Phase Prompt Generation Flow

Generation is split into two explicit phases so the user can review and edit the AI's design interpretation before the full prompt is built.

```
Phase 1 (sync, ~3–5s)               Phase 2 (async background job)
─────────────────────────────        ────────────────────────────────────
POST /api/generate-description       POST /api/generate
  JSON body: 6 fields                  multipart form: 6 fields + desc_* + content/PDF
        ↓                                     ↓
generate_design_description()         B2: generate_slide_structure()
  → DesignDescription JSON                  → list[SlideInstruction]
        ↓                                     ↓
Frontend shows 5 editable fields      B3: fill_slide_contents()
(tone/font/key_message_rule/               → list[SlideInstruction] + content
 density/visual)                           (skipped if no content)
        ↓                                     ↓
User edits if needed                  B4: assemble_master_prompt()
        ↓                                  → MasterPromptResult
POST /api/generate ─────────────►
  (desc_* fields included)            Frontend polls GET /api/jobs/{job_id} every 3s
```

---

### API Endpoints

| Endpoint | Method | Sync/Async | Purpose |
|---|---|---|---|
| `/api/generate-description` | POST | **Sync** | Phase 1: 6 form fields → DesignDescription |
| `/api/generate` | POST | **Async** → job_id | Phase 2: full Master Prompt pipeline |
| `/api/jobs/{job_id}` | GET | Sync | Poll job status / retrieve result |
| `/api/auth/register` | POST | Sync | Register new user (email/password) → 201 |
| `/api/auth/verify-email` | GET | Sync | Verify email via `?token=` → redirect to frontend |
| `/api/auth/login` | POST | Sync | Login → TokenResponse (JWT) |
| `/api/auth/logout` | POST | Sync | Clears access_token cookie |
| `/api/auth/me` | GET | Sync | Get current user (requires auth) |
| `/api/auth/google` | GET | Sync | Redirect to Google OAuth consent screen |
| `/api/auth/google/callback` | GET | Sync | Google callback → set httponly cookie → redirect frontend |

**`POST /api/generate-description`** — JSON body (`DescribeRequest`), returns `DesignDescription`:
```json
{ "purpose": "...", "audience": "...", "style": "minimalist",
  "primary_layout": "key_message", "primary_color": "#FF6B35", "language": "vi" }
```

**`POST /api/generate`** — multipart/form-data (supports PDF upload).
Description from Phase 1 is sent as 5 separate `desc_*` fields:
`desc_tone`, `desc_font`, `desc_key_message_rule`, `desc_density`, `desc_visual`.
All 5 must be non-empty for the pipeline to use them; otherwise auto-generates from the 6 form fields.

---

### LLM Pipeline (`services/llm_service.py`)

All Gemini calls use JSON response mode (`response_mime_type="application/json"`) and `tenacity` retry
(3 attempts, exponential back-off 2–10 s). Model configured via `llm_model` setting (default: `gemini-2.5-flash`).

| Function | Phase | Gemini call | temp | tokens | Input → Output |
|---|---|---|---|---|---|
| `generate_design_description()` | 1 | ✓ | 0.3 | 2000 | 6 form fields → `DesignDescription` |
| `generate_slide_structure()` | 2 B2 | ✓ | 0.3 | 3000 | purpose/audience/style/layout/slide_count/language → `list[SlideInstruction]` |
| `fill_slide_contents()` | 2 B3 | ✓ or skip | — | — | delegates to `_split_batch()` |
| `_split_batch()` | 2 B3 | ✓ | 0.2 | 6000 | slide_titles + content → `list[str]` (one per slide) |
| `assemble_master_prompt()` | 2 B4 | ✗ | — | — | design_description + slides → `MasterPromptResult` |

**`fill_slide_contents()` logic:**
- No content → returns slides unchanged (no Gemini call)
- Content > 12 000 chars → `_recursive_summarize()` (chunks at 4 000 chars, temp=0.1, tokens=1000)
- > 10 slides → two `_split_batch()` calls (first half, second half)

**`_build_full_master_prompt()` section order:**
```
[VAI TRÒ / YOUR ROLE]
[NHIỆM VỤ / YOUR TASK]
[CHỈ DẪN / GUIDELINES]         ← natural sentence from all 6 input fields (language-aware)
[MÔ TẢ THIẾT KẾ / DESIGN]     ← 5 fields from DesignDescription
[LƯU Ý / NOTE]
[YÊU CẦU FORMAT OUTPUT / OUTPUT FORMAT]
════════════════════════════════════════
[NỘI DUNG TỪNG SLIDE / SLIDE CONTENT]
════════════════════════════════════════
  ## Slide N — Title
  INSTRUCTION: ...
  CONTENT: ...   (or "(Không có tài liệu — ...)" if empty)
════════════════════════════════════════
Closing sentence (start creating slides)
```

**`guideline_text` format** (inside `[CHỈ DẪN]`) — natural flowing paragraph, all 6 fields:
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

---

### Background Worker (`workers/pipeline_worker.py`)

`run_pipeline_in_thread()` spawns a daemon thread (name: `pipeline-{job_id[:8]}`).
Each thread opens its **own** SQLAlchemy session via `SessionLocal()` — never shares the request session.

**Job lifecycle:** `PENDING → PROCESSING → COMPLETED / FAILED`

- `description` dict present and all 5 keys non-empty → used directly as `DesignDescription`
- `description` absent or empty → worker calls `generate_design_description()` automatically

Any unhandled exception marks the job `FAILED` and stores `str(exc)` in `error_message`.

---

### Schemas

**`schemas/prompt.py`:**
```
DescribeRequest       Phase 1 JSON body — 6 fields: purpose, audience, style,
                      primary_layout, primary_color, language

DesignDescription     Phase 1 response / Phase 2 input — 5 AI-generated fields:
                        tone, font, key_message_rule, density, visual

SlideInstruction      One slide: index(int), title(str), instruction(str), content(str="")

MasterPromptResult    Final job result:
                        master_prompt_title   str
                        design_description    DesignDescription
                        slide_instructions    list[SlideInstruction]
                        total_slides          int
                        full_master_prompt    str  ← the copyable prompt string
```

**`schemas/auth.py`:**
```
UserRegister          email(EmailStr), password(8–72 chars), username(optional, 3–30 chars)
UserLogin             email(EmailStr), password(str)
EmailVerifyRequest    token(str)
UserResponse          id, email, username, is_email_verified, is_active  (no password)
TokenResponse         access_token, token_type="bearer", user(UserResponse)
MessageResponse       message(str)
```

**`schemas/jobs.py`:**
```
JobStatus             PENDING | PROCESSING | COMPLETED | FAILED
GenerateResponse      job_id, status, message, created_at
JobStatusResponse     job_id, status, result(dict|None), error_message, created_at, updated_at
```

---

### Auth System (`api/auth_router.py`, `services/auth_service.py`, `core/`)

Two auth paths share the same `users` + `auth_providers` tables:

| Path | `AuthProvider.provider` | Credential stored |
|---|---|---|
| Email/password | `LOCAL` (`ProviderType.LOCAL`) | `password_hash` in `auth_providers` |
| Google OAuth | `GOOGLE` (`ProviderType.GOOGLE`) | Google `sub` ID in `auth_providers.provider_user_id` |

- Email registration → verification token stored on `User` row (no Redis). Login blocked until `is_email_verified = True`.
- Google OAuth → Authlib + `SessionMiddleware` handles state. On success, httponly `access_token` cookie is set, then redirect to `{FRONTEND_URL}/auth/callback?status=<existing_google|new_user>`.
- Linking an existing email account to Google is deliberately **blocked** (`409 CONFLICT`) to prevent account takeover.
- JWT is HS256, signed with `JWT_SECRET_KEY`. Token contains `sub` (user_id), `exp`, `iat`, `type="access"`.
- `get_current_user` reads JWT from `Authorization: Bearer` header **first**, then falls back to `access_token` httponly cookie.
- `get_current_verified_user` — stricter dependency, additionally checks `is_email_verified`.
- Rate limiting for login: `LoginAttemptTracker` in-memory dict+Lock — **resets on server restart**.
- `verify_email` endpoint → redirects to `{FRONTEND_URL}/login?verified=success` (or `?verified=error&msg=...`).

---

### Database (`database/connection.py`)

- Auto-detects SQLite vs Postgres from `SQLALCHEMY_DATABASE_URL`.
- SQLite: `check_same_thread=False`, `echo=is_development`.
- Postgres: `pool_pre_ping=True`, `pool_recycle=3600`, `echo=is_development`.
- Tables created at startup via `create_tables()` in `lifespan` — **no Alembic migrations**.
  Schema changes in dev require dropping and recreating the DB (`database.db`).

**Tables:** `users`, `auth_providers`, `jobs`

---

### Configuration (`utils/config.py`)

`Settings` (pydantic-settings, `.env` file, `lru_cache` singleton). Key groups:

| Group | Key vars | Default |
|---|---|---|
| Environment | `ENVIRONMENT` | `development` |
| Database | `SQLALCHEMY_DATABASE_URL` | `sqlite:///./prompt_builder.db` |
| LLM | `gemini_api_key`, `llm_model`, `max_slides_limit` | `""`, `gemini-2.5-flash`, `50` |
| JWT | `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | dev default, `HS256`, `1440` (1 day) |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `""`, `""`, localhost callback |
| CORS | `FRONTEND_URL`, `ALLOWED_ORIGINS` | `http://localhost:3000` |
| Rate limit | `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES` | `5`, `15` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | Gmail defaults, empty creds |
| Email | `EMAIL_VERIFY_TTL_HOURS` | `24` |

Properties: `smtp_enabled` (bool — True only if SMTP_USER + SMTP_PASSWORD both set), `is_production`, `is_development`, `get_allowed_origins() → list[str]`.

---

### Key Limits

| Resource | Limit |
|---|---|
| Text input | max 100 000 chars (`content_extractor.py`) |
| PDF size | max 10 MB, must be `application/pdf` or `application/x-pdf` |
| Slide count (API) | 3–30 (`ge=3, le=30` in form validation) |
| `fill_slide_contents` batch threshold | > 10 slides → two `_split_batch()` calls |
| Gemini content input | > 12 000 chars → `_recursive_summarize()` (4 000-char chunks) |
| Password | 8–72 chars (72 = pwdlib/bcrypt limit) |
