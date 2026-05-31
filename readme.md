# Prompt Builder

Prompt Builder là ứng dụng web dùng AI để tạo **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục tiêu, đối tượng, phong cách, nội dung văn bản hoặc PDF; hệ thống dùng Gemini để phân tích thiết kế, chia nội dung thành từng slide và xuất ra một prompt hoàn chỉnh có thể copy sang ChatGPT, Claude hoặc Gemini để tạo bộ slide.

## Mục tiêu đồ án

Đồ án giải quyết bài toán: người dùng không chuyên về prompt engineering vẫn có thể tạo prompt chất lượng cao để yêu cầu AI dựng slide thuyết trình. Thay vì viết prompt thủ công, người dùng chỉ cần:

1. Đăng ký, xác thực email hoặc đăng nhập bằng Google.
2. Điền mục đích, đối tượng, phong cách, bố cục, màu sắc và số slide.
3. Cho AI phân tích đề xuất thiết kế.
4. Chỉnh sửa mô tả thiết kế nếu cần.
5. Nhập nội dung nguồn hoặc tải PDF.
6. Nhận Master Prompt và copy sang công cụ AI khác.

## Tính năng chính

### Xác thực người dùng

- Đăng ký bằng email và mật khẩu.
- Xác thực email bằng token có thời hạn.
- Đăng nhập bằng email và mật khẩu.
- Đăng nhập Google OAuth.
- Lưu trạng thái đăng nhập bằng JWT.
- Hỗ trợ đọc token từ `Authorization: Bearer <token>` hoặc cookie `access_token`.
- Hash mật khẩu bằng Argon2 qua `pwdlib`.
- Giới hạn đăng nhập sai bằng bộ đếm in-memory.

### Sinh Master Prompt

- Phase 1: phân tích mục tiêu, đối tượng, phong cách, layout, màu sắc, ngôn ngữ để sinh mô tả thiết kế.
- Phase 2: tạo job async để sinh cấu trúc slide, chia nội dung nguồn vào từng slide và lắp thành Master Prompt.
- Hỗ trợ nội dung nguồn dạng text hoặc PDF.
- Giới hạn PDF 10 MB và nội dung text 100.000 ký tự.
- Tự tóm tắt nội dung dài trước khi chia vào slide.
- Hỗ trợ tiếng Việt và tiếng Anh.
- Poll trạng thái job cho đến khi hoàn tất hoặc lỗi.

### Quản lý lịch sử

- Xem danh sách prompt đã tạo thành công.
- Xem các job thất bại.
- Lưu bản nháp form tạo prompt.
- Mở lại bản nháp để tiếp tục chỉnh sửa.
- Xóa mềm item lịch sử vào thùng rác.
- Khôi phục item từ thùng rác.
- Xóa vĩnh viễn từng item hoặc dọn sạch thùng rác.

## Tech Stack

| Phần | Công nghệ |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLAlchemy ORM, SQLite mặc định, hỗ trợ Postgres qua connection string |
| AI | Google Gemini API, mặc định `gemini-2.5-flash` |
| Auth | JWT, Argon2, Authlib Google OAuth |
| Email | SMTP qua `smtplib`, fallback log link xác thực ở dev |
| PDF | `pypdf` |
| Retry | `tenacity` |
| Frontend | React 18, TypeScript, Vite |
| Router | React Router v6 |
| HTTP client | Axios |

## Cấu trúc thư mục

```text
prompt_builder/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── api/
│   │   ├── auth_router.py
│   │   ├── draft_router.py
│   │   ├── history_router.py
│   │   └── prompt_router.py
│   ├── core/
│   │   ├── dependencies.py
│   │   ├── oauth.py
│   │   └── security.py
│   ├── database/
│   │   └── connection.py
│   ├── models/
│   │   ├── auth_provider.py
│   │   ├── job.py
│   │   └── user.py
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── bin.py
│   │   ├── jobs.py
│   │   └── prompt.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── content_extractor.py
│   │   ├── email_service.py
│   │   ├── job_history_service.py
│   │   └── llm_service.py
│   ├── utils/
│   │   ├── config.py
│   │   └── rate_limiter.py
│   └── workers/
│       └── pipeline_worker.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── components/
│       │   └── ProtectedRoute.tsx
│       ├── context/
│       │   └── AuthContext.tsx
│       ├── pages/
│       │   ├── CallbackPage.tsx
│       │   ├── GeneratePage.tsx
│       │   ├── HistoryPage.tsx
│       │   ├── LoginPage.tsx
│       │   └── RegisterPage.tsx
│       └── services/
│           └── api.ts
├── deploy.md
├── cach_push.md
├── main.py
└── readme.md
```

Ghi chú: `backend/main.py` là entry point đầy đủ hiện tại, có đăng ký router prompt, auth, history và draft. File `main.py` ở thư mục gốc là entry point cũ hoặc bản rút gọn, chưa có đầy đủ router mới.

## Kiến trúc tổng quan

```text
React/Vite frontend
    |
    | HTTP + JWT/cookie
    v
FastAPI backend
    |
    ├── Auth routes: register, login, verify email, Google OAuth, me, logout
    ├── Prompt routes: generate-description, generate, jobs/{id}
    ├── Draft routes: save, update, get draft
    ├── History routes: list, soft delete
    └── Bin routes: list, restore, hard delete, empty bin
    |
    ├── SQLAlchemy database
    ├── Background thread pipeline
    └── Gemini API
```

## Luồng sinh Master Prompt

```text
Thông tin form
    |
    v
POST /api/generate-description
    |
    v
Gemini sinh DesignDescription:
tone, font, key_message_rule, density, visual
    |
    v
Người dùng chỉnh sửa mô tả thiết kế
    |
    v
Text/PDF + form + description
    |
    v
POST /api/generate
    |
    v
Tạo Job PENDING trong DB
    |
    v
Background thread:
PROCESSING
    |
    ├── dùng description từ Phase 1 hoặc tự sinh nếu thiếu
    ├── sinh cấu trúc slide
    ├── trích xuất và chia nội dung vào từng slide
    └── assemble MasterPromptResult
    |
    v
COMPLETED hoặc FAILED
    |
    v
Frontend poll GET /api/jobs/{job_id}
```

## Database Models

### User

Lưu người dùng:

- `id`: UUID string.
- `email`: duy nhất.
- `username`: tùy chọn.
- `is_email_verified`: trạng thái xác thực email.
- `is_active`: trạng thái tài khoản.
- `email_verification_token`: token xác thực email.
- `email_verification_expires_at`: thời điểm hết hạn token.
- `created_at`, `updated_at`.

### AuthProvider

Lưu phương thức đăng nhập của user:

- `provider`: `local` hoặc `google`.
- `provider_user_id`: ID từ provider bên ngoài, ví dụ Google sub.
- `password_hash`: chỉ dùng với provider local.

Một user có thể có nhiều provider.

### Job

Lưu job sinh prompt, lịch sử, bản nháp và thùng rác:

- `id`: UUID string.
- `status`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DRAFT`.
- `input_payload`: JSON input.
- `result_payload`: JSON kết quả khi hoàn tất.
- `error_message`: lỗi nếu job thất bại.
- `deleted_at`: `NULL` là active, có giá trị là đã vào thùng rác.
- `user_id`: chủ sở hữu.
- `created_at`, `updated_at`.

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| `POST` | `/api/auth/register` | Không | Đăng ký email/password, tạo token xác thực email |
| `POST` | `/api/auth/login` | Không | Đăng nhập và trả JWT |
| `GET` | `/api/auth/verify-email?token=...` | Không | Xác thực email rồi redirect về frontend |
| `GET` | `/api/auth/google` | Không | Bắt đầu Google OAuth |
| `GET` | `/api/auth/google/callback` | Không | Callback Google OAuth, set cookie và redirect |
| `GET` | `/api/auth/me` | Có | Lấy user hiện tại |
| `POST` | `/api/auth/logout` | Có | Xóa cookie `access_token` |

### Prompt Generation

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| `POST` | `/api/generate-description` | Có | Phase 1, sinh mô tả thiết kế đồng bộ |
| `POST` | `/api/generate` | Có | Phase 2, tạo job sinh Master Prompt |
| `GET` | `/api/jobs/{job_id}` | Có | Poll trạng thái job của user hiện tại |

`POST /api/generate-description` nhận JSON:

```json
{
  "purpose": "Báo cáo doanh số Q1",
  "audience": "Ban lãnh đạo",
  "style": "modern",
  "primary_layout": "key_message",
  "primary_color": "#667eea",
  "language": "vi"
}
```

`POST /api/generate` nhận `multipart/form-data`:

- `purpose`
- `audience`
- `style`
- `primary_color`
- `slide_count`
- `primary_layout`
- `language`
- `content`
- `pdf_file`
- `desc_tone`
- `desc_font`
- `desc_key_message_rule`
- `desc_density`
- `desc_visual`

Nếu một trong các field `desc_*` được gửi thì phải gửi đủ cả 5 field. Nếu để trống toàn bộ, backend tự sinh description trong background job.

### History, Draft, Bin

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/api/history` | Có | Lấy lịch sử active, có thể lọc theo `status` |
| `DELETE` | `/api/history/{job_id}` | Có | Xóa mềm item vào thùng rác |
| `POST` | `/api/drafts` | Có | Lưu bản nháp mới |
| `PUT` | `/api/drafts/{job_id}` | Có | Cập nhật bản nháp |
| `GET` | `/api/drafts/{job_id}` | Có | Lấy dữ liệu bản nháp để mở lại form |
| `GET` | `/api/bin` | Có | Lấy danh sách item trong thùng rác |
| `POST` | `/api/bin/{job_id}/restore` | Có | Khôi phục item từ thùng rác |
| `DELETE` | `/api/bin/{job_id}` | Có | Xóa vĩnh viễn một item |
| `DELETE` | `/api/bin` | Có | Dọn sạch thùng rác |

## Frontend Routes

| Route | Mô tả |
|---|---|
| `/login` | Đăng nhập email/password hoặc Google |
| `/register` | Đăng ký tài khoản |
| `/auth/callback` | Xử lý callback sau Google OAuth |
| `/generate` | Màn tạo Master Prompt, yêu cầu đăng nhập |
| `/history` | Lịch sử, bản nháp, job lỗi và thùng rác |
| `/bin` | Redirect về `/history` |
| `/` | Redirect về `/generate` |

## Cài đặt và chạy local

### Yêu cầu

- Python 3.11 hoặc mới hơn.
- Node.js 18 hoặc mới hơn.
- Gemini API key.

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend chạy mặc định tại:

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy tại:

- `http://localhost:3000`

Vite dev server đã cấu hình proxy `/api` sang `http://localhost:8000`.

## Cấu hình môi trường backend

Tạo file `.env` trong thư mục `backend/` khi chạy backend từ `backend`.

```env
ENVIRONMENT=development

SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db

GEMINI_API_KEY=your_gemini_api_key
LLM_MODEL=gemini-2.5-flash
MIN_SLIDES_LIMIT=3
MAX_SLIDES_LIMIT=30

JWT_SECRET_KEY=dev_only_secret_key_change_in_production_2025
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

EMAIL_VERIFY_TTL_HOURS=24

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Prompt Builder
```

Nếu không cấu hình SMTP, backend không gửi email thật mà log link xác thực ra console. Khi deploy production, phải đổi `JWT_SECRET_KEY` mạnh hơn và set `ENVIRONMENT=production`.

## Cấu hình môi trường frontend

Frontend đọc API URL từ biến:

```env
VITE_API_URL=http://localhost:8000/api
```

Nếu không set, frontend mặc định dùng `http://localhost:8000/api`.

## Script frontend

```bash
npm run dev
npm run build
npm run preview
```

`npm run build` chạy TypeScript compile trước, sau đó build Vite.

## Kiểm tra nhanh

Backend:

```bash
cd backend
python -m compileall .
```

Frontend:

```bash
cd frontend
npm run build
```

## Lưu ý kỹ thuật

- Rate limit login và generate đang dùng in-memory, nên sẽ reset khi server restart.
- Background job chạy bằng daemon thread, phù hợp demo hoặc single-server, chưa phải queue bền vững như Celery/RQ.
- SQLite phù hợp local/dev. Khi deploy nên dùng Postgres vì nhiều hosting có filesystem ephemeral.
- `create_tables()` tự tạo bảng khi FastAPI startup, chưa dùng migration tool như Alembic.
- Google OAuth cần cấu hình redirect URI đúng trong Google Cloud Console.
- Cookie OAuth dùng `secure=True` khi `ENVIRONMENT=production`.
- Các thao tác history, draft, bin đều kiểm tra `user_id` để không đọc hoặc sửa dữ liệu của user khác.
- `.env`, database local, `node_modules`, `dist`, `venv` và log đã được ignore trong `.gitignore`.

## Deploy

Xem chi tiết trong [deploy.md](deploy.md).

Tóm tắt:

- Frontend có thể deploy lên Vercel hoặc static hosting sau khi chạy `npm run build`.
- Backend cần persistent process chạy `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Database production nên dùng Postgres, ví dụ Neon, Railway Postgres hoặc Render Postgres.
- Cần set `FRONTEND_URL`, `ALLOWED_ORIGINS`, `BASE_URL`, `GOOGLE_REDIRECT_URI`, `VITE_API_URL` theo domain thật.

## Tài liệu phụ

- [deploy.md](deploy.md): hướng dẫn deploy và biến môi trường production.
- [cach_push.md](cach_push.md): hướng dẫn merge và push nhánh Git.

## Tác giả

Đồ án môn học phát triển bởi nhóm sinh viên.
