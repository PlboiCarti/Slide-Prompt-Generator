# Prompt Builder

Prompt Builder là ứng dụng web dùng AI để tạo **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục tiêu, đối tượng, phong cách thiết kế, nội dung nguồn hoặc PDF; hệ thống phân tích bằng Gemini và sinh ra một prompt hoàn chỉnh để copy sang ChatGPT, Claude, Gemini hoặc công cụ AI tạo slide khác.

## Mục Tiêu Đồ Án

Ứng dụng giải quyết bài toán: người dùng thường có tài liệu và ý tưởng trình bày, nhưng khó viết prompt đủ chi tiết để AI tạo được bộ slide đúng mục tiêu, đúng đối tượng và có thiết kế nhất quán.

Prompt Builder tách quy trình thành hai giai đoạn:

1. **Phân tích thiết kế**: AI gợi ý tone, font, quy tắc thông điệp, mật độ nội dung và định hướng visual.
2. **Sinh Master Prompt**: AI tạo cấu trúc slide, chia nội dung nguồn vào từng slide và ghép thành prompt cuối cùng.

## Tính Năng Chính

- Đăng ký, đăng nhập bằng email và mật khẩu.
- Xác thực email trước khi đăng nhập.
- Đăng nhập bằng Google OAuth.
- Bảo vệ route bằng JWT, đọc token từ `Authorization: Bearer` hoặc cookie `access_token`.
- Sinh mô tả thiết kế bằng Gemini ở Phase 1.
- Cho phép người dùng chỉnh sửa mô tả thiết kế trước khi sinh prompt.
- Sinh Master Prompt bất đồng bộ bằng background thread ở Phase 2.
- Nhận nội dung nguồn từ textarea, file PDF hoặc cả hai.
- Trích xuất text từ PDF bằng `pypdf`.
- Lưu lịch sử các lần tạo prompt hoàn tất hoặc thất bại.
- Lưu và tiếp tục bản nháp.
- Xóa mềm lịch sử vào thùng rác, khôi phục hoặc xóa vĩnh viễn.
- Rate limit cho đăng nhập sai và tạo prompt.

## Tech Stack

| Lớp | Công nghệ |
| --- | --- |
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLAlchemy ORM, SQLite mặc định, có hỗ trợ URL Postgres |
| AI | Google Gemini API qua `google-generativeai` |
| Auth | JWT, Argon2 qua `pwdlib`, Google OAuth qua Authlib |
| Frontend | React 18, TypeScript, Vite, React Router v6 |
| HTTP client | Axios |
| PDF | pypdf |
| Retry | tenacity |
| Email | SMTP qua `smtplib`, fallback log link xác thực trong dev |

## Cấu Trúc Dự Án

```text
prompt_builder/
├── main.py
├── env.example
├── deploy.md
├── QUICK_START.md
├── readme.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── api/
│   │   ├── auth_router.py
│   │   ├── prompt_router.py
│   │   ├── history_router.py
│   │   └── draft_router.py
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
│   │   └── llm_service.py
│   ├── utils/
│   │   ├── config.py
│   │   └── rate_limiter.py
│   └── workers/
│       └── pipeline_worker.py
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── services/api.ts
        ├── context/AuthContext.tsx
        ├── components/ProtectedRoute.tsx
        └── pages/
            ├── LoginPage.tsx
            ├── RegisterPage.tsx
            ├── CallbackPage.tsx
            ├── GeneratePage.tsx
            ├── HistoryPage.tsx
            └── BinPage.tsx
```

## Kiến Trúc Tổng Quan

```text
React/Vite Frontend
    |
    | Axios / REST API
    v
FastAPI Backend
    |
    +-- Auth Router: register, login, verify email, Google OAuth, me, logout
    +-- Prompt Router: generate-description, generate, jobs/{id}
    +-- History Router: history, bin
    +-- Draft Router: drafts
    |
    +-- Services
    |   +-- AuthService
    |   +-- LLM Service
    |   +-- Content Extractor
    |   +-- Email Service
    |
    +-- SQLAlchemy Models
    |   +-- User
    |   +-- AuthProvider
    |   +-- Job
    |
    +-- Gemini API
```

Backend tạo bảng khi app khởi động bằng `create_tables()` trong lifespan của FastAPI. CORS được giới hạn theo `ALLOWED_ORIGINS`. Google OAuth cần `SessionMiddleware` để lưu state tạm thời.

## Luồng Người Dùng

1. Người dùng đăng ký tài khoản bằng email và mật khẩu.
2. Backend tạo user, hash password, tạo token xác thực email và gửi email nếu SMTP đã cấu hình.
3. Người dùng xác thực email qua link `/api/auth/verify-email?token=...`.
4. Người dùng đăng nhập, frontend lưu JWT vào `localStorage`.
5. Người dùng vào trang `/generate`, nhập thông tin bài thuyết trình.
6. Frontend gọi `POST /api/generate-description` để Gemini sinh mô tả thiết kế.
7. Người dùng chỉnh sửa mô tả thiết kế nếu cần.
8. Người dùng nhập text, upload PDF hoặc dùng cả hai.
9. Frontend gọi `POST /api/generate` dạng multipart form.
10. Backend tạo `Job` trạng thái `PENDING`, chạy pipeline trong background thread.
11. Frontend poll `GET /api/jobs/{job_id}` mỗi 2 giây.
12. Khi job `COMPLETED`, frontend hiển thị `full_master_prompt` để copy.

## Logic Sinh Prompt

### Phase 1: Phân Tích Thiết Kế

Endpoint: `POST /api/generate-description`

Input gồm:

- `purpose`
- `audience`
- `style`
- `primary_layout`
- `primary_color`
- `language`

Backend gọi `generate_design_description()` trong `backend/services/llm_service.py`. Gemini trả về JSON theo schema:

```json
{
  "tone": "...",
  "font": "...",
  "key_message_rule": "...",
  "density": "...",
  "visual": "..."
}
```

Frontend hiển thị 5 trường này để người dùng kiểm tra và chỉnh sửa.

### Phase 2: Sinh Master Prompt

Endpoint: `POST /api/generate`

Yêu cầu đăng nhập. Backend kiểm tra rate limit, validate input, trích xuất nội dung từ text/PDF, tạo `Job` và chạy `run_pipeline_in_thread()`.

Pipeline trong `backend/workers/pipeline_worker.py`:

1. Cập nhật job sang `PROCESSING`.
2. Dùng mô tả thiết kế từ Phase 1; nếu không có thì tự gọi Gemini để sinh.
3. Gọi `generate_slide_structure()` để tạo đúng số lượng slide.
4. Gọi `fill_slide_contents()` để chia nội dung nguồn vào từng slide.
5. Gọi `assemble_master_prompt()` để ghép thành `MasterPromptResult`.
6. Lưu kết quả JSON vào `job.result_payload` và cập nhật trạng thái `COMPLETED`.
7. Nếu có lỗi, lưu `error_message` và cập nhật `FAILED`.

Kết quả cuối gồm:

- `master_prompt_title`
- `design_description`
- `slide_instructions`
- `total_slides`
- `full_master_prompt`

## Xử Lý Nội Dung Nguồn

File: `backend/services/content_extractor.py`

- Cho phép nhập text, PDF hoặc cả hai.
- Text tối đa `100_000` ký tự.
- PDF tối đa `10 MB`.
- Chỉ chấp nhận MIME `application/pdf` hoặc `application/x-pdf`.
- Kiểm tra magic bytes `%PDF`.
- Nếu PDF là ảnh scan hoặc không trích xuất được text, backend trả lỗi rõ ràng.
- Nếu có cả text và PDF, hệ thống ghép text trước, PDF sau, ngăn cách bằng `---`.

Trong `llm_service.py`, nếu nội dung dài hơn `12_000` ký tự, hệ thống tóm tắt đệ quy theo chunk trước khi chia vào slide.

## Auth Và Bảo Mật

### Email/password

- Đăng ký tạo bản ghi `User` và `AuthProvider` loại `LOCAL`.
- Mật khẩu được hash bằng `PasswordHash.recommended()` của `pwdlib`, dùng Argon2 khi dependency hỗ trợ.
- Email verification token được tạo bằng `secrets.token_urlsafe(32)`.
- Token xác thực email được lưu trong DB ở bảng `users`.
- Token hết hạn theo `EMAIL_VERIFY_TTL_HOURS`, mặc định 24 giờ.
- User chưa xác thực email không được đăng nhập bằng password.

### Google OAuth

- Endpoint `/api/auth/google` redirect người dùng sang Google.
- Callback `/api/auth/google/callback` nhận thông tin Google user.
- Nếu Google account đã tồn tại, backend đăng nhập ngay.
- Nếu email đã đăng ký bằng password, backend không tự link Google để tránh chiếm tài khoản.
- Nếu là user mới, backend tạo `User` và `AuthProvider` loại `GOOGLE`.
- Token được set vào cookie `access_token` dạng HttpOnly.

### JWT

- Token chứa `sub`, `exp`, `iat`, `type`.
- Backend đọc token từ header trước, cookie sau.
- Route được bảo vệ qua `get_current_user()`.
- User bị `is_active = False` sẽ bị chặn.

### Rate Limit

File: `backend/utils/rate_limiter.py`

- Dùng in-memory dictionary và `threading.Lock`.
- Login bị khóa tạm sau `MAX_LOGIN_ATTEMPTS` lần sai trong cửa sổ `LOCKOUT_MINUTES`.
- Generate bị giới hạn theo user id với `MAX_GENERATE_ATTEMPTS` và `GENERATE_LOCKOUT_MINUTES`.
- Vì lưu in-memory, counter sẽ reset khi server restart.

Lưu ý: trong code hiện tại, generate tracker đang dùng hàm `record_failed_attempt()` như bộ đếm số lần gửi request hợp lệ sau validate, không chỉ đếm lỗi.

## Database Model

### `users`

- `id`: UUID string, primary key.
- `email`: unique, indexed.
- `username`: optional, unique.
- `is_email_verified`
- `is_active`
- `email_verification_token`
- `email_verification_expires_at`
- `created_at`
- `updated_at`

### `auth_providers`

- `id`: UUID string.
- `user_id`: foreign key tới `users`.
- `provider`: `LOCAL` hoặc `GOOGLE`.
- `provider_user_id`: Google sub nếu dùng Google.
- `password_hash`: chỉ có với provider `LOCAL`.
- `created_at`

### `jobs`

- `id`: UUID string.
- `user_id`: owner của job.
- `status`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DRAFT`.
- `input_payload`: JSON string lưu input hoặc draft.
- `result_payload`: JSON string lưu kết quả.
- `error_message`
- `deleted_at`: null là đang hiển thị, có giá trị là đã vào thùng rác.
- `created_at`
- `updated_at`

## Frontend

Các route chính trong `frontend/src/App.tsx`:

| Route | Mô tả |
| --- | --- |
| `/login` | Đăng nhập email/password hoặc Google |
| `/register` | Đăng ký tài khoản |
| `/auth/callback` | Xử lý callback sau Google OAuth |
| `/generate` | Trang tạo Master Prompt, cần đăng nhập |
| `/history` | Lịch sử prompt, bản nháp và job thất bại |
| `/bin` | Thùng rác |

`AuthContext` quản lý trạng thái đăng nhập, gọi `/auth/me` khi app load, lưu token email/password vào `localStorage` và xóa token khi logout hoặc gặp 401.

`ProtectedRoute` chặn các trang yêu cầu đăng nhập và redirect về `/login` nếu chưa xác thực.

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Không | Đăng ký email/password |
| POST | `/api/auth/login` | Không | Đăng nhập, trả JWT |
| GET | `/api/auth/verify-email?token=...` | Không | Xác thực email, redirect về frontend |
| GET | `/api/auth/google` | Không | Bắt đầu Google OAuth |
| GET | `/api/auth/google/callback` | Không | Callback từ Google |
| GET | `/api/auth/me` | Có | Lấy thông tin user hiện tại |
| POST | `/api/auth/logout` | Có | Xóa cookie `access_token` |

### Prompt Generation

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/generate-description` | Không | Phase 1, sinh mô tả thiết kế |
| POST | `/api/generate` | Có | Phase 2, tạo job sinh Master Prompt |
| GET | `/api/jobs/{job_id}` | Có | Poll trạng thái job của chính user |

### History, Draft, Bin

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| GET | `/api/history` | Có | Lấy lịch sử `COMPLETED`, `FAILED`, `DRAFT` |
| GET | `/api/history?status=COMPLETED` | Có | Lọc lịch sử theo trạng thái |
| DELETE | `/api/history/{job_id}` | Có | Xóa mềm vào thùng rác |
| POST | `/api/drafts` | Có | Lưu bản nháp |
| PUT | `/api/drafts/{job_id}` | Có | Cập nhật bản nháp |
| GET | `/api/drafts/{job_id}` | Có | Lấy nội dung bản nháp |
| GET | `/api/bin` | Có | Lấy danh sách trong thùng rác |
| POST | `/api/bin/{job_id}/restore` | Có | Khôi phục từ thùng rác |
| DELETE | `/api/bin/{job_id}` | Có | Xóa vĩnh viễn một item |
| DELETE | `/api/bin` | Có | Dọn sạch thùng rác |

## Cấu Hình Môi Trường

Backend đọc `.env` bằng `pydantic-settings`. File `.env` nên đặt trong thư mục chạy backend.

Ví dụ:

```dotenv
ENVIRONMENT=development

SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db

GEMINI_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-2.5-flash

JWT_SECRET_KEY=change_this_to_a_random_secret_at_least_32_chars
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

Tên biến `GEMINI_API_KEY` và `LLM_MODEL` map được vào `gemini_api_key` và `llm_model` nhờ Pydantic Settings không phân biệt hoa thường.

Nếu chưa cấu hình SMTP, backend không gửi email thật mà log link xác thực ra console.

## Cài Đặt Và Chạy Local

### Backend

```bash
cd backend

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt

copy env.example .env
# chỉnh .env, đặc biệt GEMINI_API_KEY và JWT_SECRET_KEY

uvicorn main:app --reload
```

Backend mặc định chạy tại:

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

Vite config đã proxy `/api` sang `http://localhost:8000`, nhưng `frontend/src/services/api.ts` mặc định dùng `http://localhost:8000/api`. Có thể override bằng biến môi trường frontend:

```dotenv
VITE_API_URL=http://localhost:8000/api
```

## Build Frontend

```bash
cd frontend
npm run build
```

Lệnh này chạy TypeScript compiler rồi build Vite.

## Trạng Thái Job

```text
PENDING -> PROCESSING -> COMPLETED
                    \-> FAILED

DRAFT là trạng thái riêng cho bản nháp, không đi qua pipeline xử lý.
```

## Lưu Ý Hiện Hành

- `POST /api/generate-description` hiện không yêu cầu đăng nhập.
- `POST /api/generate` và `GET /api/jobs/{job_id}` yêu cầu đăng nhập.
- Job status chỉ trả về job thuộc user hiện tại và chưa bị xóa mềm.
- Background worker là daemon thread trong cùng process, không dùng Redis/RQ/Celery.
- Nếu server restart khi job đang chạy, job có thể kẹt ở `PENDING` hoặc `PROCESSING`.
- Database được tạo bằng `Base.metadata.create_all()`, chưa có migration tool như Alembic.
- SQLite mặc định phù hợp demo/local; production nên dùng Postgres và migration.
- Rate limit và background thread đều là in-memory/process-local, không phù hợp scale nhiều instance nếu chưa thay bằng Redis/queue.
- PDF scan ảnh không có OCR nên sẽ không trích xuất được nội dung.
- Một số text hiển thị trong frontend hiện đang bị lỗi encoding trong source, nên UI có thể hiện ký tự sai nếu chưa sửa file mã nguồn.

## Tác Giả

Đồ án môn học - Prompt Builder.
