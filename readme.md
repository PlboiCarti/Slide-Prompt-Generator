# Prompt Builder

Ứng dụng web hai giai đoạn giúp người dùng tạo **Master Prompt** hoàn chỉnh cho bài thuyết trình PowerPoint. Người dùng mô tả mục đích, đối tượng và phong cách; AI (Google Gemini) phân tích và sinh ra một Design Direction đầy đủ gồm Color Palette, Typography Sheet và hướng dẫn thiết kế — sau đó người dùng cung cấp nội dung nguồn, hệ thống tổng hợp thành Master Prompt sẵn sàng để dán vào ChatGPT, Claude hoặc Gemini để tạo slide.

> Hướng dẫn cài đặt đầy đủ (Tesseract OCR, Poppler, biến môi trường): xem [QUICK_START.md](./QUICK_START.md).

## Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Kiến trúc 2 giai đoạn](#kiến-trúc-2-giai-đoạn)
- [Kiến trúc hiệu năng frontend](#kiến-trúc-hiệu-năng-frontend)
- [Quản lý Draft](#quản-lý-draft)
- [Xác thực và phiên đăng nhập](#xác-thực-và-phiên-đăng-nhập)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [API Endpoints](#api-endpoints)
- [Ghi chú phát triển và giới hạn hiện tại](#ghi-chú-phát-triển-và-giới-hạn-hiện-tại)

---

## Tính năng chính

- Đăng ký / đăng nhập email+password với xác thực email bắt buộc; polling tự động chuyển trang khi xác thực xong.
- Gửi lại email xác thực (cooldown 120 giây frontend, rate limit theo email ở backend).
- Đăng nhập Google OAuth — tự tạo tài khoản khi email mới; từ chối auto-link nếu email đã đăng ký bằng password để tránh account takeover.
- **Phase 1 — Design Analysis:** Gemini nhận 6 trường brief và trả về `DesignDescription` đầy đủ: `tone`, `key_message_rule`, `density`, `visual`, `color_palette` (primary/secondary/accent/neutrals) và `typography` (font family, 4 role sheets: title/eyebrow/body/supporting với size_pt, weight, color, extra).
- **Phase 2 — Master Prompt Generation:** Job bất đồng bộ chạy trong background thread; frontend poll `GET /api/jobs/{id}` mỗi 2 giây.
- Adaptive Theme Spec Sheet — Color Palette và Typography hiển thị đúng contrast trong cả Dark và Light mode thông qua CSS custom properties semantic.
- Upload PDF/PNG/JPG/JPEG/WEBP (tối đa 10 MB/file); kiểm tra 3 lớp: extension, MIME type và magic bytes.
- OCR song ngữ Việt/Anh cho PDF scan và ảnh (Tesseract + Poppler).
- Lưu / cập nhật bản nháp thủ công; khôi phục draft qua `location.state` hydration.
- Lịch sử các prompt đã tạo; xóa mềm vào thùng rác, khôi phục, xóa vĩnh viễn từng mục hoặc toàn bộ.
- Rate limiting in-memory cho đăng nhập sai, tạo prompt (Phase 1 + Phase 2 chung một bộ đếm), gửi lại email và polling verification-status.

---

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Frontend | React 18, TypeScript (strict), Vite 5 |
| Routing frontend | React Router DOM |
| HTTP client | Axios (`withCredentials: true`, cookie-based) |
| Database | SQLAlchemy, mặc định SQLite (chuyển Postgres qua env) |
| AI | Google Gemini (`google-genai`, model `gemini-2.5-flash`) |
| Xác thực | JWT (HttpOnly cookie), Argon2 (pwdlib), Google OAuth (Authlib) |
| Email | SMTP hoặc log link ra console khi dev |
| PDF text | pypdf |
| OCR | pytesseract + Pillow + pdf2image (Poppler) |
| Retry LLM | tenacity |

---

## Kiến trúc 2 giai đoạn

```text
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1 — Design Analysis  (sync, ~3–5s)                   │
│                                                             │
│  Frontend gửi 6 trường:                                     │
│    purpose, audience, style, primary_layout,                │
│    primary_color, language                                  │
│           │                                                 │
│           ▼                                                 │
│  POST /api/generate-description                             │
│           │                                                 │
│           ▼                                                 │
│  Gemini trả về DesignDescription:                           │
│    tone · key_message_rule · density · visual               │
│    color_palette: { primary, secondary, accent,             │
│                     neutrals[3], description }              │
│    typography: { font_family, font_category,                │
│                  weights_allowed,                           │
│                  title/eyebrow/body/supporting:             │
│                    { size_pt, weight, color, extra } }      │
│           │                                                 │
│           ▼                                                 │
│  Frontend render Adaptive Spec Sheet — người dùng           │
│  có thể chỉnh trực tiếp trước khi sang Phase 2             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PHASE 2 — Master Prompt Generation  (async)                │
│                                                             │
│  Frontend gửi formData + contentLatestRef + files           │
│  + DesignDescription đã chỉnh sửa                          │
│           │                                                 │
│           ▼                                                 │
│  POST /api/generate                                         │
│  → Backend tạo Job (status PENDING)                         │
│  → Lưu file upload vào uploads/{job_id}/                    │
│  → Khởi động daemon background thread                       │
│           │                                                 │
│           ▼  (background thread)                            │
│  pipeline_worker.run_pipeline_in_thread():                  │
│    1. Extract content — pypdf hoặc Tesseract OCR            │
│    2. Dùng DesignDescription từ Phase 1 (hoặc sinh mới)     │
│    3. generate_slide_structure() → SlideInstruction[]       │
│    4. fill_slide_contents() — nếu có nội dung               │
│    5. assemble_master_prompt() → MasterPromptResult         │
│    6. Xóa uploads/{job_id}/                                 │
│           │                                                 │
│           ▼  (frontend polling, interval = 2000ms)          │
│  GET /api/jobs/{job_id}                                     │
│    status: PENDING → PROCESSING → COMPLETED | FAILED        │
│           │                                                 │
│           ▼                                                 │
│  Hiển thị Master Prompt, tự scroll vào result               │
│  Lưu tự động vào lịch sử khi COMPLETED                     │
└─────────────────────────────────────────────────────────────┘
```

> **Rate limit:** `POST /api/generate-description` (Phase 1) và `POST /api/generate` (Phase 2) đều tính vào cùng bộ đếm `MAX_GENERATE_ATTEMPTS`/`GENERATE_LOCKOUT_MINUTES` theo user.

---

## Kiến trúc hiệu năng frontend

`GeneratePage` xử lý nhiều input phức tạp đồng thời (9 style cards, 9 layout cards, color picker, slide counter, content textarea, 6 palette swatches, 4 typography role cards, 4 direction textareas). Để đạt 60fps khi gõ, code áp dụng hai pattern:

### 1. Module-level memoization — tách render tree

Các sub-component nặng được định nghĩa ngoài `GeneratePage` và bọc `React.memo`, đảm bảo props stable → bỏ qua re-render khi phần còn lại của trang cập nhật:

| Component | Memo'd | Props stable nhờ |
|---|---|---|
| `StyleCardGrid` | ✓ | `useCallback(handleStyleSelect, [])` |
| `LayoutCardGrid` | ✓ | `useCallback(handleLayoutSelect, [])` |
| `PaletteSwatchGrid` | ✓ | `palette` object ref không đổi khi chỉ direction thay đổi |
| `TypographySpecSheet` | ✓ | `typography` object ref không đổi khi chỉ direction thay đổi |
| `DesignDirectionCards` | ✓ | `useCallback(handleDirectionChange, [])` |
| `DirectionCard` (×4) | ✓ | stable `onChange` từ parent |
| `TypoRoleRow` (×4) | ✓ | stable `onChange` từ parent |
| `SwatchTile` (×6) | ✓ | stable `onChange` từ parent |

Stable references dựa vào việc `setDescription` chỉ spread ở top-level — `description.color_palette` và `description.typography` giữ nguyên object identity khi người dùng chỉ chỉnh direction fields, nên `PaletteSwatchGrid` và `TypographySpecSheet` bỏ qua re-render hoàn toàn.

### 2. Input decoupling — cô lập content textarea

Content textarea (`formData.content`) được tách khỏi global state bằng pattern ref:

```
┌─ contentLocal (useState)  ──────────────────────────────────┐
│   ↑ setContentLocal(value)                                  │
│   ↑ handleContentChange — chạy mỗi keystroke               │
│                                                             │
├─ contentLatestRef (useRef)  ────────────────────────────────┤
│   ↑ contentLatestRef.current = value  (sync, no re-render)  │
│   → đọc bởi handleSubmit và handleSaveDraft                 │
│   → đọc bởi Ctrl/Cmd+Enter keyboard shortcut               │
│                                                             │
├─ formData.content  ─────────────────────────────────────────┤
│   ↑ flush on blur (handleContentBlur)                       │
│   ↑ sync từ external mutations (clear, draft hydration)     │
│     qua useEffect guard: formData.content !== ref.current   │
└─────────────────────────────────────────────────────────────┘
```

Kết quả: `GeneratePage` không re-render khi người dùng gõ trong content textarea. `handleSubmit` và draft save luôn đọc `contentLatestRef.current` (không đợi blur) để đảm bảo payload luôn có nội dung mới nhất.

### 3. Stable callback refs — keyboard shortcut không bị stale

`latestHandleSubmit` (`useRef`) được cập nhật mỗi render, nhưng keyboard shortcut effect chỉ đăng ký một lần (`deps=[]`). Pattern này tránh re-register event listener mỗi render trong khi vẫn gọi đúng phiên bản `handleSubmit` mới nhất.

---

## Quản lý Draft

Legacy debounced auto-save chạy nền đã bị **xóa bỏ** vì gây nhầm lẫn state identity (người dùng không biết khi nào form được lưu tự động, dẫn đến conflict giữa draft cũ và input hiện tại).

Thay thế bằng vòng đời draft thủ công rõ ràng:

```
Lưu mới  →  POST /api/drafts   →  lưu currentDraftId vào state
Cập nhật →  PUT  /api/drafts/{id}  (khi currentDraftId đã có)
Khôi phục →  navigate('/generate', { state: { draft } })
              → useEffect tại GeneratePage hydrate toàn bộ formData,
                files, description, currentDraftId từ location.state
```

Payload draft bao gồm `contentLatestRef.current` (không phải `formData.content`) để đảm bảo nội dung chưa blur cũng được lưu.

---

## Xác thực và phiên đăng nhập

### Đăng ký email/password

1. `POST /api/auth/register` — tạo user, gửi email xác thực (hoặc log link ra console nếu SMTP trống).
2. Frontend poll `GET /api/auth/verification-status?email=...` mỗi 3 giây (rate-limit theo IP); tự chuyển sang `/login?verified=success` khi phát hiện đã verify — kể cả khi mở link ở tab khác.
3. User click link → `GET /api/auth/verify-email?token=...` → backend set `is_email_verified=true`, redirect về frontend.
4. Sau 10 phút chưa verify, frontend dừng polling, hiện nút gửi lại (cooldown 120s frontend, rate-limit theo email backend).

### Đăng nhập email/password

`POST /api/auth/login` — kiểm tra rate limit, verify Argon2, kiểm tra `is_email_verified`, set JWT vào cookie `access_token` (HttpOnly).

### Google OAuth

1. `GET /api/auth/google` → redirect Google (Authlib), `prompt=select_account`.
2. `GET /api/auth/google/callback` — xử lý 3 case: đã có Google provider → login; email đã dùng password → từ chối; email mới → tạo user.
3. Set cookie, redirect `FRONTEND_URL/auth/callback?status=...`. `CallbackPage` gọi `GET /api/auth/me` rồi vào `/generate`.

### Cookie & bảo vệ route

- Cookie `access_token`: `HttpOnly`, `SameSite=Lax`, `Secure` khi `ENVIRONMENT=production`, `max_age = JWT_ACCESS_TOKEN_EXPIRE_MINUTES × 60`.
- `get_current_user`: đọc `Authorization: Bearer` header trước, fallback sang cookie — dùng được qua Swagger và từ frontend.
- `POST /api/auth/logout` xóa cookie.
- Axios instance: `withCredentials: true` — cookie gửi kèm mọi request.

---

## Cấu trúc thư mục

```text
Slide-Prompt-Generator/
├── readme.md
├── QUICK_START.md
│
├── backend/
│   ├── main.py                       FastAPI app, CORS, SessionMiddleware, lifespan
│   ├── requirements.txt
│   ├── .env.example
│   │
│   ├── api/
│   │   ├── auth_router.py            /api/auth — đăng ký, đăng nhập, email verify, Google OAuth, me, logout
│   │   ├── draft_router.py           /api/drafts — lưu, cập nhật, đọc bản nháp
│   │   ├── history_router.py         /api/history, /api/bin — lịch sử, xóa mềm, thùng rác
│   │   └── prompt_router.py          /api/generate-description, /api/generate, /api/jobs/{id}
│   │
│   ├── core/
│   │   ├── dependencies.py           get_current_user — Bearer header hoặc HttpOnly cookie
│   │   ├── oauth.py                  Authlib Google OAuth config
│   │   └── security.py               Argon2 hashing, JWT create/decode
│   │
│   ├── database/
│   │   └── connection.py             SQLAlchemy engine, SessionLocal, Base
│   │
│   ├── models/
│   │   ├── user.py                   User (email_verification_token, is_email_verified)
│   │   ├── auth_provider.py          local / google provider
│   │   └── job.py                    Job — dùng cho generation, draft, history, bin
│   │
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── prompt.py                 DesignDescription, MasterPromptResult
│   │   ├── jobs.py                   JobStatus, GenerateResponse, JobStatusResponse
│   │   ├── history.py
│   │   └── bin.py
│   │
│   ├── services/
│   │   ├── auth_service.py           đăng ký, đăng nhập, email verify, Google login
│   │   ├── content_extractor.py      pypdf + Tesseract OCR (vie+eng), magic-byte validation
│   │   ├── email_service.py          SMTP hoặc console fallback
│   │   ├── job_history_service.py    Job → history/bin schema, ownership check
│   │   └── llm_service.py            Gemini calls — generate_design_description, generate_slide_structure, fill, assemble
│   │
│   ├── utils/
│   │   ├── config.py                 pydantic-settings — tất cả env vars và defaults
│   │   ├── rate_limiter.py           in-memory tracker: login, generate, resend, verification-status
│   │   └── upload_cleanup.py         dọn uploads/ cũ hơn 24h khi app khởi động
│   │
│   ├── workers/
│   │   └── pipeline_worker.py        run_pipeline_in_thread — daemon background thread
│   │
│   └── uploads/                      file tạm theo job_id (tự dọn, không commit)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts                port 3000, proxy /api → http://localhost:8000
    ├── tsconfig.json
    └── src/
        ├── App.tsx                   React Router routes
        ├── index.css                 CSS custom properties (dark/light theme tokens)
        ├── components/
        │   ├── ProtectedRoute.tsx
        │   └── ThemeToggle.tsx
        ├── context/
        │   └── AuthContext.tsx       global auth state, /auth/me on load
        ├── pages/
        │   ├── LandingPage.tsx
        │   ├── LoginPage.tsx / AuthPage.css
        │   ├── RegisterPage.tsx      đăng ký + email verify polling + resend cooldown
        │   ├── CallbackPage.tsx      Google OAuth callback
        │   ├── GeneratePage.tsx      2-phase engine, memo isolation, ref decoupling
        │   ├── GeneratePage.css      adaptive dark/light theme spec sheet
        │   ├── HistoryPage.tsx
        │   └── HistoryPage.css
        └── services/
            └── api.ts                Axios instance + typed namespaces: authAPI, promptAPI, historyAPI, draftAPI, binAPI
```

---

## Bắt đầu nhanh

Yêu cầu: Python 3.11+, Node.js 18+, Tesseract OCR (kèm gói `vie`+`eng`), Poppler. Xem hướng dẫn cài từng bước tại **[QUICK_START.md](./QUICK_START.md)**.

```bash
# Backend — terminal 1
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # điền GEMINI_API_KEY tối thiểu
uvicorn main:app --reload    # http://localhost:8000  |  Swagger: /docs
```

```bash
# Frontend — terminal 2
cd frontend
npm install
cp .env.example .env         # VITE_API_URL mặc định đã đúng
npm run dev                  # http://localhost:3000
```

---

## Cấu hình môi trường

### Backend (`backend/.env`)

Toàn bộ biến và giá trị mặc định khai báo trong `backend/utils/config.py`.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` hoặc `production` — production bắt buộc đổi `JWT_SECRET_KEY` |
| `GEMINI_API_KEY` | _(rỗng)_ | API key Google Gemini — bắt buộc |
| `LLM_MODEL` | `gemini-2.5-flash` | Model Gemini |
| `MIN_SLIDES_LIMIT` / `MAX_SLIDES_LIMIT` | `3` / `30` | Giới hạn số slide |
| `SQLALCHEMY_DATABASE_URL` | `sqlite:///./database.db` | Đổi sang Postgres: `postgresql://user:pass@host/db` |
| `JWT_SECRET_KEY` | _(dev key)_ | Ký JWT — **phải đổi ở production** |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Thời hạn token (phút), đồng thời là `max_age` cookie |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | _(rỗng)_ | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/google/callback` | |
| `FRONTEND_URL` | `http://localhost:3000` | Redirect sau Google login / email verify |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | CORS origins, phân tách bằng dấu phẩy |
| `BASE_URL` | `http://localhost:8000` | URL backend — dùng trong link email |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | `5` / `15` | Rate limit đăng nhập sai theo email |
| `MAX_GENERATE_ATTEMPTS` / `GENERATE_LOCKOUT_MINUTES` | `5` / `10` | Rate limit tạo prompt (Phase 1+2 chung) theo user |
| `EMAIL_VERIFY_TTL_HOURS` | `24` | Thời hạn link xác thực |
| `MAX_RESEND_ATTEMPTS` / `RESEND_LOCKOUT_MINUTES` | `5` / `10` | Rate limit gửi lại email theo email |
| `MAX_VERIFICATION_STATUS_ATTEMPTS` / `VERIFICATION_STATUS_LOCKOUT_MINUTES` | `60` / `1` | Rate limit polling verification-status theo IP |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `587` | |
| `SMTP_USER` / `SMTP_PASSWORD` | _(rỗng)_ | Để trống → log link ra console (dev mode) |
| `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` | _(rỗng)_ / `Prompt Builder` | |
| `TESSERACT_CMD` | _(rỗng)_ | Đường dẫn `tesseract.exe` — chỉ cần set nếu không có trong PATH |
| `POPPLER_PATH` | _(rỗng)_ | Đường dẫn thư mục `bin` của Poppler — chỉ cần set nếu không có trong PATH |

### Frontend (`frontend/.env`)

| Biến | Mặc định | Mô tả |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` | URL gốc API; Vite cũng proxy `/api` → `http://localhost:8000` khi dev |

---

## API Endpoints

Prefix `/api`. Swagger UI: `http://localhost:8000/docs`.

### Auth

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký email/password, gửi email xác thực |
| POST | `/api/auth/login` | Đăng nhập — set cookie `access_token` (HttpOnly) |
| GET | `/api/auth/verification-status` | Poll trạng thái verify email (rate-limit theo IP) |
| POST | `/api/auth/resend-verification` | Gửi lại email xác thực (rate-limit theo email) |
| GET | `/api/auth/verify-email` | Xác thực qua token link, redirect về frontend |
| GET | `/api/auth/google` | Bắt đầu Google OAuth |
| GET | `/api/auth/google/callback` | Callback Google — set cookie, redirect |
| GET | `/api/auth/me` | Thông tin user hiện tại |
| POST | `/api/auth/logout` | Xóa cookie `access_token` |

### Prompt

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/generate-description` | Phase 1 — Gemini sinh `DesignDescription` |
| POST | `/api/generate` | Phase 2 — tạo Job, upload file, chạy background pipeline |
| GET | `/api/jobs/{job_id}` | Poll trạng thái và kết quả Job |

### History & Bin

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/history` | Danh sách lịch sử (phân trang) |
| DELETE | `/api/history/{job_id}` | Xóa mềm — chuyển vào bin |
| GET | `/api/bin` | Danh sách thùng rác (phân trang) |
| POST | `/api/bin/{job_id}/restore` | Khôi phục từ bin |
| DELETE | `/api/bin/{job_id}` | Xóa vĩnh viễn 1 item |
| DELETE | `/api/bin` | Xóa vĩnh viễn toàn bộ bin |

### Drafts

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/drafts` | Lưu bản nháp mới (`DRAFT` job) |
| PUT | `/api/drafts/{job_id}` | Cập nhật bản nháp |
| GET | `/api/drafts/{job_id}` | Đọc bản nháp |

---

## Ghi chú phát triển và giới hạn hiện tại

- Rate limit lưu **in-memory** — reset khi server restart. Chấp nhận được cho single-instance / đồ án; dùng Redis cho production multi-instance.
- Token xác thực email lưu trong database (`users.email_verification_token`), không mất khi restart.
- Background job dùng **daemon thread** (`run_pipeline_in_thread`) — không queue, phù hợp single-instance. Không scale ngang; chuyển sang Celery/Redis khi cần.
- File upload lưu tạm `backend/uploads/{job_id}/`; được xóa ngay sau khi job hoàn tất. `upload_cleanup.py` quét thêm các thư mục tồn đọng >24h khi app khởi động.
- Upload: extension + MIME + magic bytes; hỗ trợ PDF/PNG/JPG/JPEG/WEBP; tối đa 10 MB/file.
- SQLite mặc định; đổi sang Postgres qua `SQLALCHEMY_DATABASE_URL` khi cần concurrent access.
- `JWT_SECRET_KEY` có prefix `dev_only_` — `Settings.check_production_secrets` raise error khi `ENVIRONMENT=production` và key chưa được đổi.
- `npm run build` (`tsc --strict` + Vite) là lệnh lint duy nhất của frontend — không có ESLint hoặc Ruff được cấu hình.
