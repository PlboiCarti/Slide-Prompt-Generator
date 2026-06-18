# Prompt Builder

Ứng dụng web hỗ trợ tạo **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục đích, đối tượng, phong cách, nội dung hoặc file tài liệu (PDF/ảnh); hệ thống dùng AI (Gemini) để phân tích và sinh ra một prompt hoàn chỉnh, có thể dán vào ChatGPT, Claude, Gemini hoặc công cụ AI khác để tạo slide.

> Hướng dẫn cài đặt chi tiết (bao gồm cài Tesseract OCR và Poppler): xem [QUICK_START.md](./QUICK_START.md).

## Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
- [Luồng xử lý chính](#luồng-xử-lý-chính)
- [Xác thực và phiên đăng nhập](#xác-thực-và-phiên-đăng-nhập)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [API Endpoints](#api-endpoints)
- [Ghi chú phát triển và giới hạn hiện tại](#ghi-chú-phát-triển-và-giới-hạn-hiện-tại)
- [License](#license)

## Tính năng chính

- Đăng ký, đăng nhập bằng email và mật khẩu; bắt buộc xác thực email trước khi đăng nhập.
- Gửi lại email xác thực khi chưa nhận được hoặc đã hết hạn (cooldown phía frontend, rate limit phía backend); trang đăng ký tự động poll trạng thái xác thực và chuyển sang đăng nhập khi xong.
- Đăng nhập bằng Google OAuth (tự tạo tài khoản nếu email Google chưa từng đăng ký).
- Phiên đăng nhập dùng JWT lưu trong cookie `HttpOnly` cho cả 2 luồng (email/password và Google) — không lưu token ở `localStorage`, giảm rủi ro bị đánh cắp qua XSS.
- Sinh mô tả thiết kế slide ở giai đoạn 1 (tone, font, density, visual...) để người dùng xem và chỉnh sửa.
- Sinh Master Prompt ở giai đoạn 2 bằng background job, frontend poll trạng thái cho đến khi hoàn tất.
- Upload nội dung từ PDF hoặc ảnh PNG, JPG, JPEG, WEBP (tối đa 10MB/file), kiểm tra extension, MIME type và magic bytes.
- Trích xuất nội dung từ tài liệu, hỗ trợ OCR song ngữ Việt/Anh cho file scan (Tesseract + Poppler).
- Lưu lịch sử các lần tạo prompt, lưu bản nháp form tạo prompt và tiếp tục chỉnh sửa sau.
- Xóa mềm vào thùng rác, khôi phục, xóa từng mục vĩnh viễn hoặc dọn sạch toàn bộ thùng rác.
- Giới hạn số lần đăng nhập sai, số lần tạo prompt, số lần gửi lại email xác thực và số lần poll trạng thái xác thực để giảm spam/abuse.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Frontend | React 18, TypeScript, Vite |
| Routing frontend | React Router DOM |
| Gọi API frontend | Axios (cookie-based, `withCredentials: true`) |
| Cơ sở dữ liệu | SQLAlchemy, mặc định SQLite |
| AI | Google Gemini API |
| Xác thực | JWT (HttpOnly cookie), Argon2, Google OAuth (Authlib) |
| Email | SMTP hoặc log link xác thực ra console khi dev |
| Xử lý PDF | pypdf, pdf2image |
| OCR | Tesseract OCR (pytesseract), Pillow, Poppler |
| Retry | tenacity |

## Kiến trúc tổng thể

```text
Prompt Builder
├── frontend/                 Ứng dụng React chạy trên trình duyệt
│   ├── Trang đăng nhập/đăng ký (+ xác thực email, Google OAuth)
│   ├── Trang tạo Master Prompt (2 giai đoạn)
│   ├── Trang lịch sử và thùng rác
│   └── API client gọi FastAPI backend (cookie-based session)
│
└── backend/                  API server FastAPI
    ├── Auth API              Đăng ký, đăng nhập, xác thực email, Google OAuth, user hiện tại
    ├── Prompt API            Sinh mô tả thiết kế, tạo job sinh prompt, poll job
    ├── History API           Danh sách lịch sử, xóa mềm, thùng rác
    ├── Draft API              Lưu, sửa, đọc bản nháp
    ├── Services              Xử lý nghiệp vụ, gọi Gemini, trích xuất nội dung (OCR), gửi email
    ├── Workers               Chạy pipeline sinh prompt trong background thread
    └── Database              Lưu user, provider xác thực, job, draft, history
```

## Luồng xử lý chính

```text
Người dùng nhập form hoặc upload file
        |
        v
POST /api/generate-description
        |
        v
Gemini sinh mô tả thiết kế: tone, font, mật độ, visual...
        |
        v
Người dùng chỉnh sửa mô tả thiết kế nếu cần
        |
        v
POST /api/generate
        |
        v
Backend tạo Job, lưu file upload vào uploads/{job_id}/, chạy worker nền
        |
        v
Worker trích xuất nội dung (PDF/OCR), gọi Gemini, ghép Master Prompt
        |
        v
Worker dọn uploads/{job_id}/ sau khi xử lý xong
        |
        v
Frontend poll GET /api/jobs/{job_id}
        |
        v
Hiển thị kết quả và lưu vào lịch sử
```

> Cả `POST /api/generate-description` (Phase 1) và `POST /api/generate` (Phase 2) đều tính vào cùng một bộ đếm rate limit `MAX_GENERATE_ATTEMPTS`/`GENERATE_LOCKOUT_MINUTES` theo user — gọi Phase 1 nhiều lần (vd: bấm "Phân tích lại") cũng tiêu hao số lượt cho phép.

## Xác thực và phiên đăng nhập

### Đăng ký bằng email/password

1. `POST /api/auth/register` — tạo user, lưu `email_verification_token` + thời hạn vào bảng `users`, gửi email xác thực (hoặc log link ra console nếu chưa cấu hình SMTP).
2. Frontend chuyển sang màn "Chờ xác thực email" và poll `GET /api/auth/verification-status?email=...` mỗi 3 giây (rate-limit theo IP) để phát hiện khi user đã verify — kể cả khi link được mở ở tab/thiết bị khác.
3. User click link trong email → `GET /api/auth/verify-email?token=...` → backend đặt `is_email_verified = true`, xoá token, redirect về `FRONTEND_URL/login?verified=success`.
4. Sau 10 phút chưa verify, frontend dừng polling và hiện nút "Gửi lại email xác thực" → `POST /api/auth/resend-verification` (rate-limit theo email, cooldown 120s ở frontend).

### Đăng nhập bằng email/password

`POST /api/auth/login` — kiểm tra rate limit (`MAX_LOGIN_ATTEMPTS`/`LOCKOUT_MINUTES` theo email), verify password (Argon2), kiểm tra `is_email_verified`, sau đó set JWT vào cookie `access_token`.

### Đăng nhập bằng Google OAuth

1. `GET /api/auth/google` → redirect sang Google (Authlib), kèm `prompt=select_account` để luôn hiện màn chọn account.
2. Google redirect về `GET /api/auth/google/callback`.
3. Backend xử lý theo 3 trường hợp:
   - Đã từng đăng nhập Google với `sub` này → login luôn.
   - Email đã đăng ký bằng password (chưa có Google provider) → từ chối, yêu cầu đăng nhập bằng password (không auto-link để tránh account takeover).
   - Email hoàn toàn mới → tạo user mới, `is_email_verified` lấy theo Google.
4. Set cookie `access_token`, redirect về `FRONTEND_URL/auth/callback?status=...`. `CallbackPage` gọi `GET /api/auth/me` để load user rồi chuyển vào `/generate`.

### Cookie & bảo vệ route

- Cả 2 luồng trên đều set cookie `access_token`: `HttpOnly`, `SameSite=Lax`, `Secure` khi `ENVIRONMENT=production`, `max_age = JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60` (giây). Token KHÔNG trả về trong response body và KHÔNG lưu ở `localStorage`.
- `core/dependencies.get_current_user` đọc token từ header `Authorization: Bearer <token>` trước, nếu không có thì fallback sang cookie `access_token` — dùng được cả qua Swagger/Postman (Bearer) và từ frontend (cookie).
- `POST /api/auth/logout` xoá cookie `access_token`.
- Frontend (`frontend/src/services/api.ts`) tạo Axios instance với `withCredentials: true` để cookie được gửi kèm mọi request tới backend.

## Cấu trúc thư mục

```text
prompt_builder/
├── readme.md
├── QUICK_START.md
├── .gitignore
│
├── backend/
│   ├── main.py                       Entry point FastAPI, đăng ký router, CORS, lifespan (cleanup uploads/)
│   ├── requirements.txt
│   ├── .env.example                  Mẫu file môi trường — copy thành .env và điền giá trị thật
│   │
│   ├── api/
│   │   ├── auth_router.py            /api/auth: đăng ký, đăng nhập, xác thực email, resend, Google OAuth, me, logout
│   │   ├── draft_router.py           /api/drafts: lưu, cập nhật, đọc bản nháp
│   │   ├── history_router.py         /api/history, /api/bin: lịch sử, xóa mềm, thùng rác, khôi phục, xóa vĩnh viễn
│   │   └── prompt_router.py          /api/generate-description, /api/generate, /api/jobs/{job_id}
│   │
│   ├── core/
│   │   ├── dependencies.py           Dependency lấy user hiện tại từ Authorization header hoặc HttpOnly cookie
│   │   ├── oauth.py                  Cấu hình Authlib cho Google OAuth
│   │   └── security.py               Hash mật khẩu (Argon2), tạo và kiểm tra JWT
│   │
│   ├── database/
│   │   └── connection.py             Engine SQLAlchemy, session, Base, tạo bảng
│   │
│   ├── models/
│   │   ├── auth_provider.py          Provider đăng nhập local hoặc Google
│   │   ├── job.py                    Job sinh prompt (cũng dùng cho draft, lịch sử, thùng rác)
│   │   └── user.py                   Người dùng (gồm cột email_verification_token)
│   │
│   ├── schemas/
│   │   ├── auth.py                   Schema request/response xác thực
│   │   ├── bin.py                    Schema item trong thùng rác (PaginatedBinResponse)
│   │   ├── history.py                Schema lịch sử, phân trang, lưu bản nháp
│   │   ├── jobs.py                   JobStatus, GenerateResponse, JobStatusResponse
│   │   └── prompt.py                 Schema mô tả thiết kế và Master Prompt output
│   │
│   ├── services/
│   │   ├── auth_service.py           Nghiệp vụ đăng ký, đăng nhập, xác thực/resend email, Google login
│   │   ├── content_extractor.py      Trích xuất text từ input, PDF (pypdf) và ảnh/PDF scan (Tesseract OCR vie+eng)
│   │   ├── email_service.py          Gửi email xác thực hoặc fallback log ra console
│   │   ├── job_history_service.py    Chuyển đổi job sang dữ liệu history/bin, kiểm tra quyền sở hữu
│   │   └── llm_service.py            Gọi Gemini để sinh mô tả thiết kế và Master Prompt
│   │
│   ├── utils/
│   │   ├── config.py                 Cấu hình đọc từ .env (pydantic-settings)
│   │   ├── rate_limiter.py           Theo dõi giới hạn đăng nhập, tạo prompt, resend, polling verify (in-memory)
│   │   └── upload_cleanup.py         Dọn các thư mục uploads/{job_id} cũ hơn TTL khi app khởi động
│   │
│   ├── workers/
│   │   └── pipeline_worker.py        Worker chạy pipeline sinh prompt trong background thread
│   │
│   └── uploads/                      Thư mục lưu file tạm theo job_id (tự dọn, không commit)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts                Dev server :3000, proxy /api → http://localhost:8000
    ├── tsconfig.json / tsconfig.node.json
    ├── .env.example                  Mẫu file môi trường — copy thành .env
    └── src/
        ├── main.tsx
        ├── App.tsx                   Khai báo route (React Router)
        ├── index.css
        ├── components/
        │   └── ProtectedRoute.tsx    Bảo vệ route cần đăng nhập
        ├── context/
        │   └── AuthContext.tsx       Quản lý state đăng nhập toàn cục (gọi /auth/me khi load)
        ├── pages/
        │   ├── LoginPage.tsx / AuthPage.css          Đăng nhập, đọc query param verify/error
        │   ├── RegisterPage.tsx                      Đăng ký + polling xác thực email + resend
        │   ├── CallbackPage.tsx                      Callback cho Google OAuth
        │   ├── GeneratePage.tsx / GeneratePage.css   Form tạo Master Prompt (2 giai đoạn)
        │   └── HistoryPage.tsx / HistoryPage.css     Lịch sử và thùng rác
        ├── services/
        │   └── api.ts                Axios instance (withCredentials) + các API call
        └── vite-env.d.ts
```

## Bắt đầu nhanh

Yêu cầu: Python 3.11+, Node.js 18+, Tesseract OCR, Poppler. Xem hướng dẫn cài đặt đầy đủ (gồm cài Tesseract/Poppler theo từng OS) tại **[QUICK_START.md](./QUICK_START.md)**.

Tóm tắt khi đã có sẵn môi trường:

```bash
# Backend — terminal 1
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# Tạo file .env từ mẫu, rồi điền giá trị thật (xem mục Cấu hình môi trường)
cp .env.example .env           # macOS/Linux
# copy .env.example .env       # Windows (cmd)

uvicorn main:app --reload
# → http://localhost:8000   (Swagger: /docs)
```

```bash
# Frontend — terminal 2
cd frontend
npm install
cp .env.example .env           # macOS/Linux — copy .env.example .env trên Windows (cmd)
npm run dev
# → http://localhost:3000
```

## Cấu hình môi trường

### Backend (`backend/.env`)

Copy `backend/.env.example` thành `backend/.env` rồi điền giá trị thật. Toàn bộ biến và giá trị mặc định khai báo tại `backend/utils/config.py`.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` hoặc `production`. Production bắt buộc đổi `JWT_SECRET_KEY`. |
| `SQLALCHEMY_DATABASE_URL` | `sqlite:///./database.db` | Đổi sang Postgres khi cần: `postgresql://user:pass@host:5432/dbname` |
| `gemini_api_key` | _(rỗng)_ | API key Google Gemini |
| `llm_model` | `gemini-2.5-flash` | Model Gemini dùng để sinh prompt |
| `min_slides_limit` / `max_slides_limit` | `3` / `30` | Giới hạn số slide cho phép |
| `JWT_SECRET_KEY` | _(dev key mẫu)_ | Khóa ký JWT — **phải đổi** ở production |
| `JWT_ALGORITHM` | `HS256` | Thuật toán JWT |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Thời hạn access token (phút) — cũng là `max_age` của cookie `access_token` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | _(rỗng)_ | Lấy từ Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/google/callback` | Callback URL OAuth |
| `FRONTEND_URL` | `http://localhost:3000` | URL frontend — dùng để redirect sau khi login Google / verify email |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Danh sách origin CORS, phân tách bằng dấu phẩy |
| `BASE_URL` | `http://localhost:8000` | URL backend, dùng trong link email |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | `5` / `15` | Giới hạn đăng nhập sai theo email |
| `MAX_GENERATE_ATTEMPTS` / `GENERATE_LOCKOUT_MINUTES` | `5` / `10` | Giới hạn số lần tạo prompt theo user (tính cả Phase 1 và Phase 2) |
| `EMAIL_VERIFY_TTL_HOURS` | `24` | Thời hạn link xác thực email |
| `MAX_RESEND_ATTEMPTS` / `RESEND_LOCKOUT_MINUTES` | `5` / `10` | Giới hạn gửi lại email xác thực theo email |
| `MAX_VERIFICATION_STATUS_ATTEMPTS` / `VERIFICATION_STATUS_LOCKOUT_MINUTES` | `60` / `1` | Giới hạn polling `GET /auth/verification-status` theo IP |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `587` | SMTP server gửi email |
| `SMTP_USER` / `SMTP_PASSWORD` | _(rỗng)_ | Để trống → dev mode, log link xác thực ra console |
| `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` | _(rỗng)_ / `Prompt Builder` | Thông tin người gửi email |
| `TESSERACT_CMD` | _(rỗng)_ | Đường dẫn `tesseract.exe` — chỉ cần set nếu không có trong PATH (thường gặp trên Windows) |
| `POPPLER_PATH` | _(rỗng)_ | Đường dẫn thư mục `bin` của Poppler — chỉ cần set nếu không có trong PATH (thường gặp trên Windows) |

### Frontend (`frontend/.env`)

Copy `frontend/.env.example` thành `frontend/.env`.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` | URL gốc của backend API mà frontend gọi tới |

## API Endpoints

Tất cả endpoint dưới đây có prefix `/api`. Swagger UI: `http://localhost:8000/docs`. `GET /` (ngoài `/api`) là health check, trả về thông tin app và danh sách endpoint chính.

### Auth

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký bằng email/mật khẩu, gửi email xác thực |
| POST | `/api/auth/login` | Đăng nhập bằng email/mật khẩu — set JWT vào cookie `access_token` (HttpOnly) |
| GET | `/api/auth/verification-status` | Polling trạng thái xác thực email (dùng ở trang đăng ký), rate-limit theo IP |
| POST | `/api/auth/resend-verification` | Gửi lại email xác thực, rate-limit theo email |
| GET | `/api/auth/verify-email` | Xác thực email qua token trong link, redirect về frontend |
| GET | `/api/auth/google` | Bắt đầu luồng đăng nhập Google OAuth |
| GET | `/api/auth/google/callback` | Callback nhận kết quả từ Google — set cookie, redirect về frontend |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |
| POST | `/api/auth/logout` | Đăng xuất — xóa cookie `access_token` |

### Prompt

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/generate-description` | Giai đoạn 1: Gemini sinh mô tả thiết kế (tone, font, density, visual...) |
| POST | `/api/generate` | Giai đoạn 2: tạo Job, upload file, chạy worker sinh Master Prompt |
| GET | `/api/jobs/{job_id}` | Poll trạng thái và kết quả của Job |

### History & Bin

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/history` | Danh sách lịch sử (phân trang, lọc theo status) |
| DELETE | `/api/history/{job_id}` | Xóa mềm — chuyển vào thùng rác |
| GET | `/api/bin` | Danh sách thùng rác (phân trang) |
| POST | `/api/bin/{job_id}/restore` | Khôi phục item từ thùng rác |
| DELETE | `/api/bin/{job_id}` | Xóa vĩnh viễn 1 item |
| DELETE | `/api/bin` | Xóa vĩnh viễn toàn bộ thùng rác |

### Drafts

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/drafts` | Lưu bản nháp mới (Job với status `DRAFT`) |
| PUT | `/api/drafts/{job_id}` | Cập nhật bản nháp |
| GET | `/api/drafts/{job_id}` | Đọc bản nháp |

## Ghi chú phát triển và giới hạn hiện tại

- Rate limit (đăng nhập sai, tạo prompt, gửi lại email xác thực, polling verification-status) lưu **in-memory** theo từng tracker riêng — mất sau khi restart server, chấp nhận được cho đồ án.
- Token xác thực email lưu trong **database** (cột `users.email_verification_token` / `email_verification_expires_at`), không cần Redis và không mất khi restart server.
- Phiên đăng nhập (email/password và Google) dùng JWT trong cookie `HttpOnly` (`SameSite=Lax`, `Secure` khi production) — xem chi tiết ở mục [Xác thực và phiên đăng nhập](#xác-thực-và-phiên-đăng-nhập).
- Job sinh Master Prompt chạy trong **background thread** (`run_pipeline_in_thread`), không dùng queue/Redis — phù hợp single-instance, đơn giản hóa cho đồ án.
- File upload lưu tạm tại `backend/uploads/{job_id}/`, được dọn ngay sau khi job xử lý xong; `utils/upload_cleanup.py` quét và xóa thêm các thư mục tồn đọng quá 24h mỗi khi app khởi động.
- File upload được kiểm tra extension, MIME type và magic bytes; định dạng hỗ trợ: PDF, PNG, JPG, JPEG, WEBP; tối đa 10MB/file.
- Database mặc định SQLite (`database.db`); đổi sang Postgres qua `SQLALCHEMY_DATABASE_URL` khi cần nhiều kết nối đồng thời.
- Xóa lịch sử là xóa mềm bằng `deleted_at`; xóa trong thùng rác là xóa vĩnh viễn khỏi database.

## License

Dự án phục vụ mục đích học tập/đồ án, chưa công bố license chính thức.
