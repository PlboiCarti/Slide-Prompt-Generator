# Prompt Builder

> Ứng dụng AI tự động sinh **Master Prompt** chuyên nghiệp cho bài thuyết trình PowerPoint — chỉ cần điền thông tin, nhận prompt, copy vào ChatGPT / Claude / Gemini là xong.

---

## Giới thiệu

Prompt Builder giải quyết bài toán: *"Làm sao viết được prompt tốt để AI tạo slide đẹp?"*

Thay vì tự viết prompt thủ công, người dùng chỉ cần:
1. Điền mục đích, đối tượng, phong cách thuyết trình
2. Paste nội dung tài liệu hoặc upload PDF
3. Nhận **Master Prompt** hoàn chỉnh → copy vào AI bất kỳ → có ngay bộ slide

---

## Tính năng

### Sinh Master Prompt
- Phân tích nội dung đầu vào (text hoặc PDF)
- Sinh cấu trúc slide thông minh bằng Gemini AI
- Chia nội dung tài liệu vào từng slide phù hợp
- Xuất Master Prompt hoàn chỉnh, sẵn sàng copy

### Tùy chỉnh linh hoạt
- **Mục đích:** pitch, report, training, proposal, awareness, demo
- **Đối tượng:** investor, student, executive, developer, client...
- **Phong cách:** minimalist, modern, storytelling, academic, corporate, creative, technical
- **Bố cục:** key message, split, grid cards, timeline, big stat, full image
- **Ngôn ngữ:** Tiếng Việt / English
- **Màu sắc chủ đạo** tuỳ chỉnh

### Xác thực & Bảo mật
- Đăng ký / đăng nhập bằng email + password
- Xác thực email trước khi đăng nhập
- Đăng nhập Google OAuth
- JWT stateless, Argon2 password hashing
- Rate limiting: khóa tài khoản sau 5 lần đăng nhập sai

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| **Backend** | Python 3.11, FastAPI, Uvicorn |
| **Database** | SQLite + SQLAlchemy ORM |
| **AI** | Google Gemini API (`gemini-2.5-flash`) |
| **Auth** | JWT (PyJWT), Argon2 (pwdlib), Google OAuth (Authlib) |
| **Frontend** | React 18 + TypeScript, Vite, React Router v6 |
| **Rate Limiting** | In-memory (LoginAttemptTracker) — login & generate |
| **PDF Parsing** | pypdf |
| **Retry Logic** | tenacity |

---

## Kiến trúc hệ thống

```
┌─────────────────┐        ┌──────────────────────────────────┐
│                 │  HTTP  │  FastAPI Backend                 │
│  React Frontend │◄──────►│                                  │
│  (Vite :5173)   │        │  ┌──────────┐  ┌─────────────┐   │
│                 │        │  │ Auth     │  │ Prompt      │   │
└─────────────────┘        │  │ Router   │  │ Router      │   │
                           │  └────┬─────┘  └──────┬──────┘   │
                           │       │               │          │
                           │  ┌────▼───────────────▼────────┐ │
                           │  │        Services             │ │
                           │  │  AuthService │ LLM Service  │ │
                           │  └────┬─────────────┬──────────┘ │
                           │       │             │            │
                           │  ┌────▼──────┐  ┌───▼─────────┐  │
                           │  │  SQLite   │  │  Gemini API │  │
                           │  │  database │  │  (Google)   │  │
                           │  └───────────┘  └─────────────┘  │
                           └──────────────────────────────────┘
```

### Pipeline sinh Master Prompt

```
Input (text/PDF)
      │
      ▼
[Tầng 1] Content Extractor
  → Trích xuất text từ PDF
  → Gộp text + PDF thành 1 chuỗi
      │
      ▼
[Tầng 2] Pipeline Worker (background thread)
  → Build instruction từ payload
  → Gemini: sinh system_instruction + cấu trúc N slides
  → Gemini: phân chia nội dung vào từng slide
  → Assemble → MasterPromptResult
      │
      ▼
Output: full_master_prompt (copy 1 lần vào AI khác)
```

---

## Cấu trúc dự án

```
PromptBuilder/
├── backend/
│   ├── main.py                  # Entry point FastAPI
│   ├── requirements.txt
│   ├── .env                     # Config
│   │
│   ├── api/                     # HTTP routes
│   │   ├── prompt_router.py     # POST /generate-description, /generate, GET /jobs/{id}
│   │   └── auth_router.py       # Register, login, OAuth, me
│   │
│   ├── core/                    # Auth core
│   │   ├── security.py          # JWT, Argon2
│   │   ├── dependencies.py      # get_current_user
│   │   └── oauth.py             # Authlib Google config
│   │
│   ├── database/
│   │   └── connection.py        # SQLAlchemy engine, SessionLocal
│   │
│   ├── models/                  # SQLAlchemy models
│   │   ├── job.py
│   │   ├── user.py
│   │   └── auth_provider.py     # LOCAL / GOOGLE provider
│   │
│   ├── schemas/                 # Pydantic schemas
│   │   ├── jobs.py
│   │   ├── prompt.py
│   │   └── auth.py
│   │
│   ├── services/                # Business logic
│   │   ├── auth_service.py      # Register, login, Google OAuth
│   │   ├── llm_service.py       # Gemini: sinh Master Prompt
│   │   ├── content_extractor.py # Text + PDF extraction
│   │   └── email_service.py     # SMTP hoặc console fallback
│   │
│   ├── workers/
│   │   └── pipeline_worker.py   # Background thread pipeline
│   │
│   └── utils/
│       ├── config.py            # Settings (pydantic-settings)
│       └── rate_limiter.py      # Login & generate attempt tracker
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx              # Router setup
        ├── main.tsx
        ├── index.css
        ├── services/
        │   └── api.ts           # axios instance + auth/prompt API calls
        ├── context/
        │   └── AuthContext.tsx  # Global auth state
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── GeneratePage.tsx # Prompt Builder UI (2 Phase)
        │   └── CallbackPage.tsx # Google OAuth callback
        └── components/
            └── ProtectedRoute.tsx
```

---

## Cài đặt & Chạy

### Yêu cầu hệ thống
- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

Backend chạy mặc định tại:

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Cấu hình (.env)

```dotenv
# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
LLM_MODEL=gemini-2.5-flash

# Database (SQLite)
SQLALCHEMY_DATABASE_URL=sqlite:///./database.db

# JWT (tạo key: python -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET_KEY=your_secret_key_min_32_chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
BASE_URL=http://localhost:8000

MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
MAX_GENERATE_ATTEMPTS=5
GENERATE_LOCKOUT_MINUTES=10
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/register` | Đăng ký email/password |
| POST | `/api/auth/login` | Đăng nhập, nhận JWT |
| GET | `/api/auth/verify-email?token=` | Xác thực email |
| GET | `/api/auth/google` | Bắt đầu Google OAuth |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Thông tin user hiện tại (yêu cầu auth) |
| POST | `/api/auth/logout` | Đăng xuất |

### Prompt Generation

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/api/generate-description` | **Bắt buộc** | Phase 1 — phân tích & gợi ý thiết kế (sync, ~3–5s) |
| POST | `/api/generate` | **Bắt buộc** | Phase 2 — tạo job sinh Master Prompt (async) |
| GET | `/api/jobs/{job_id}` | Không | Kiểm tra trạng thái job |

### Job Status

```
PENDING → PROCESSING → COMPLETED
                     ↘ FAILED
```

---

## Lưu ý phát triển

| Vấn đề | Giải thích |
|---|---|
| Verify token mất sau restart | Token xác thực email lưu in-memory. Restart uvicorn → phải register lại. |
| Rate limit reset khi restart | Bộ đếm đăng nhập sai & generate cũng in-memory, reset khi restart. |
| Rate limit generate | `MAX_GENERATE_ATTEMPTS=5` / `GENERATE_LOCKOUT_MINUTES=10` — giới hạn số lần tạo prompt liên tiếp theo user. |
| Gemini rate limit | `gemini-2.5-flash`: 5 req/phút. Pipeline có delay để tránh lỗi 429. |
| Google OAuth cần cấu hình | Phải thêm redirect URI vào Google Cloud Console. |
| Phase 1 & 2 đều cần auth | Cả `POST /api/generate-description` và `POST /api/generate` đều yêu cầu Bearer token. Rate limit 5 lần/10 phút theo user, dùng chung quota. |

---

## Tác giả

Đồ án môn học — phát triển bởi nhóm sinh viên.