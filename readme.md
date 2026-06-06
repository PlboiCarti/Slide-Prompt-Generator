# Prompt Builder

Prompt Builder là ứng dụng web dùng AI để sinh **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục đích, đối tượng, phong cách thiết kế, nội dung văn bản hoặc PDF; hệ thống phân tích và tạo prompt hoàn chỉnh để copy sang ChatGPT, Claude, Gemini hoặc công cụ AI khác.

## Mục Tiêu Đồ Án

Đồ án giải quyết bài toán: người dùng muốn tạo slide bằng AI nhưng không biết viết prompt đủ chi tiết, có cấu trúc và có định hướng thiết kế. Prompt Builder chuẩn hóa quá trình đó bằng một form có sẵn, kết hợp Gemini AI để sinh mô tả thiết kế và Master Prompt cuối cùng.

Luồng sử dụng chính:

1. Đăng ký, xác thực email hoặc đăng nhập bằng Google.
2. Nhập thông tin bài thuyết trình: mục đích, đối tượng, phong cách, bố cục, màu chủ đạo, số slide, ngôn ngữ.
3. AI phân tích và đề xuất mô tả thiết kế.
4. Người dùng chỉnh mô tả nếu cần, nhập nội dung text hoặc upload PDF.
5. Backend tạo job xử lý nền, frontend poll trạng thái.
6. Khi hoàn tất, người dùng copy Master Prompt hoặc xem lại trong lịch sử.

## Tính Năng Chính

- Sinh mô tả thiết kế bằng Gemini AI ở Phase 1.
- Sinh Master Prompt bất đồng bộ ở Phase 2.
- Hỗ trợ nội dung nguồn dạng text và PDF.
- Cho phép chỉnh 5 trường thiết kế: tone, font, quy tắc thông điệp chính, mật độ thông tin, hướng dẫn hình ảnh.
- Tùy chọn phong cách: minimalist, modern, storytelling, academic, corporate, creative, technical.
- Tùy chọn bố cục: key message, split, grid cards, timeline, big stat, image overlay.
- Hỗ trợ tiếng Việt và tiếng Anh.
- Đăng ký, đăng nhập email/password, xác thực email.
- Đăng nhập Google OAuth.
- JWT authentication, cookie HttpOnly cho OAuth, Bearer token cho email/password.
- Lưu bản nháp, cập nhật bản nháp và tiếp tục chỉnh sửa.
- Lịch sử prompt theo trạng thái: hoàn thành, bản nháp, thất bại.
- Xóa mềm vào thùng rác, khôi phục, xóa vĩnh viễn hoặc dọn sạch thùng rác.
- Rate limit cho đăng nhập và sinh prompt.

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLAlchemy ORM, SQLite mặc định, có thể cấu hình PostgreSQL |
| AI | Google Gemini API |
| Auth | JWT, Argon2, Authlib Google OAuth |
| Email | SMTP hoặc console fallback khi phát triển |
| PDF | pypdf |
| Retry | tenacity |
| Frontend | React 18, TypeScript, Vite |
| Routing | React Router DOM |
| HTTP Client | axios |

## Kiến Trúc Tổng Quan

```text
React Frontend
  |
  | HTTP / JSON / multipart-form
  v
FastAPI Backend
  |
  |-- Auth Router: register, login, verify email, Google OAuth, me, logout
  |-- Prompt Router: generate-description, generate, jobs/{id}
  |-- History Router: history, bin, restore, hard delete
  |-- Draft Router: save draft, update draft, load draft
  |
  |-- Services
  |     |-- AuthService
  |     |-- LLM Service
  |     |-- Content Extractor
  |     |-- Email Service
  |     |-- Job History Service
  |
  |-- Workers
  |     |-- Pipeline Worker chạy job nền
  |
  |-- Database
        |-- users
        |-- auth_providers
        |-- jobs
```

## Pipeline Sinh Prompt

```text
Thông tin form + text/PDF
        |
        v
Phase 1: /api/generate-description
        |
        |-- Gemini sinh gợi ý thiết kế
        |-- Frontend hiển thị cho người dùng chỉnh sửa
        v
Phase 2: /api/generate
        |
        |-- Backend validate form
        |-- Trích xuất text từ PDF nếu có
        |-- Tạo Job PENDING trong database
        |-- Pipeline Worker chạy nền
        |-- Gemini sinh cấu trúc slide và nội dung prompt
        |-- Lưu result_payload vào Job
        v
Frontend poll /api/jobs/{job_id}
        |
        v
COMPLETED / FAILED
```

## Cấu Trúc Thư Mục

```text
prompt_builder/
|-- readme.md
|-- deploy.md
|-- main.py
|-- pagination.md
|-- improve_pagination.md
|-- backend/
|   |-- main.py
|   |-- requirements.txt
|   |-- api/
|   |   |-- auth_router.py
|   |   |-- draft_router.py
|   |   |-- history_router.py
|   |   |-- prompt_router.py
|   |   `-- __init__.py
|   |-- core/
|   |   |-- dependencies.py
|   |   |-- oauth.py
|   |   |-- security.py
|   |   `-- __init__.py
|   |-- database/
|   |   |-- connection.py
|   |   `-- __init__.py
|   |-- models/
|   |   |-- auth_provider.py
|   |   |-- job.py
|   |   |-- user.py
|   |   `-- __init__.py
|   |-- schemas/
|   |   |-- auth.py
|   |   |-- bin.py
|   |   |-- history.py
|   |   |-- jobs.py
|   |   |-- prompt.py
|   |   `-- __init__.py
|   |-- services/
|   |   |-- auth_service.py
|   |   |-- content_extractor.py
|   |   |-- email_service.py
|   |   |-- job_history_service.py
|   |   |-- llm_service.py
|   |   `-- __init__.py
|   |-- utils/
|   |   |-- config.py
|   |   |-- rate_limiter.py
|   |   `-- __init__.py
|   `-- workers/
|       `-- pipeline_worker.py
`-- frontend/
    |-- package.json
    |-- package-lock.json
    |-- index.html
    |-- vite.config.ts
    |-- tsconfig.json
    |-- tsconfig.node.json
    `-- src/
        |-- App.tsx
        |-- main.tsx
        |-- index.css
        |-- vite-env.d.ts
        |-- components/
        |   `-- ProtectedRoute.tsx
        |-- context/
        |   `-- AuthContext.tsx
        |-- services/
        |   `-- api.ts
        `-- pages/
            |-- AuthPage.css
            |-- BinPage.tsx
            |-- CallbackPage.tsx
            |-- GeneratePage.css
            |-- GeneratePage.tsx
            |-- HistoryPage.css
            |-- HistoryPage.tsx
            |-- LoginPage.tsx
            `-- RegisterPage.tsx
```

## Vai Trò Các Module

### Backend

- `backend/main.py`: entry point FastAPI, cấu hình CORS, session middleware, tạo bảng database khi startup và include các router.
- `api/auth_router.py`: API đăng ký, đăng nhập, xác thực email, Google OAuth, lấy thông tin user và đăng xuất.
- `api/prompt_router.py`: API sinh mô tả thiết kế, tạo job sinh Master Prompt và poll trạng thái job.
- `api/history_router.py`: API xem lịch sử, xóa mềm, xem thùng rác, khôi phục, xóa vĩnh viễn.
- `api/draft_router.py`: API lưu, cập nhật và tải bản nháp.
- `core/security.py`: xử lý JWT và hash password bằng Argon2.
- `core/dependencies.py`: dependency lấy user hiện tại từ token/cookie.
- `core/oauth.py`: cấu hình Authlib Google OAuth.
- `database/connection.py`: tạo engine SQLAlchemy, session và bảng dữ liệu.
- `models/`: định nghĩa bảng user, auth provider và job.
- `schemas/`: định nghĩa request/response Pydantic.
- `services/auth_service.py`: logic đăng ký, đăng nhập, verify email, OAuth.
- `services/llm_service.py`: logic gọi Gemini để sinh mô tả và Master Prompt.
- `services/content_extractor.py`: gộp text input và trích xuất nội dung PDF.
- `services/email_service.py`: gửi email xác thực hoặc in link ra console khi chưa cấu hình SMTP.
- `services/job_history_service.py`: helper chuyển đổi job sang response lịch sử/thùng rác và kiểm tra quyền sở hữu.
- `workers/pipeline_worker.py`: chạy pipeline sinh prompt trong background thread.
- `utils/config.py`: đọc cấu hình từ `.env` bằng pydantic-settings.
- `utils/rate_limiter.py`: giới hạn số lần đăng nhập sai và số lần generate.

### Frontend

- `frontend/src/App.tsx`: khai báo route chính: login, register, callback, generate, history.
- `frontend/src/context/AuthContext.tsx`: quản lý trạng thái đăng nhập toàn cục.
- `frontend/src/services/api.ts`: cấu hình axios, gắn Bearer token, định nghĩa các API client.
- `frontend/src/components/ProtectedRoute.tsx`: bảo vệ route cần đăng nhập.
- `frontend/src/pages/LoginPage.tsx`: màn hình đăng nhập.
- `frontend/src/pages/RegisterPage.tsx`: màn hình đăng ký.
- `frontend/src/pages/CallbackPage.tsx`: xử lý redirect sau Google OAuth.
- `frontend/src/pages/GeneratePage.tsx`: màn hình chính để phân tích thiết kế, lưu nháp, nhập nội dung và sinh Master Prompt.
- `frontend/src/pages/HistoryPage.tsx`: xem lịch sử, bản nháp, prompt thất bại và thùng rác.
- `frontend/src/pages/BinPage.tsx`: màn hình thùng rác riêng, hiện route `/bin` đang được redirect về `/history`.

## Cài Đặt Và Chạy Local

### Yêu Cầu

- Python 3.11 trở lên.
- Node.js 18 trở lên.
- Gemini API key nếu muốn sinh prompt thật.

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend chạy mặc định tại:

```text
http://localhost:8000
http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy mặc định tại:

```text
http://localhost:3000
```

Vite đã cấu hình proxy `/api` sang `http://localhost:8000`.

## Cấu Hình Môi Trường

Tạo file `.env` trong thư mục `backend/`.

```dotenv
ENVIRONMENT=development

SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db

GEMINI_API_KEY=your_gemini_api_key
LLM_MODEL=gemini-2.5-flash
MIN_SLIDES_LIMIT=3
MAX_SLIDES_LIMIT=30

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

EMAIL_VERIFY_TTL_HOURS=24

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Prompt Builder
```

Nếu chưa cấu hình SMTP, hệ thống chạy ở chế độ phát triển và in link xác thực email ra console.

## API Chính

### Authentication

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký tài khoản email/password |
| POST | `/api/auth/login` | Đăng nhập và nhận JWT |
| GET | `/api/auth/verify-email?token=` | Xác thực email |
| GET | `/api/auth/google` | Bắt đầu Google OAuth |
| GET | `/api/auth/google/callback` | Callback Google OAuth |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |
| POST | `/api/auth/logout` | Đăng xuất |

### Prompt

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/generate-description` | Phase 1: sinh gợi ý thiết kế |
| POST | `/api/generate` | Phase 2: tạo job sinh Master Prompt |
| GET | `/api/jobs/{job_id}` | Poll trạng thái job và lấy kết quả |

### History, Draft, Bin

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/history` | Lấy danh sách lịch sử có phân trang, hỗ trợ lọc status |
| DELETE | `/api/history/{job_id}` | Xóa mềm một mục vào thùng rác |
| POST | `/api/drafts` | Lưu bản nháp |
| PUT | `/api/drafts/{job_id}` | Cập nhật bản nháp |
| GET | `/api/drafts/{job_id}` | Tải dữ liệu bản nháp |
| GET | `/api/bin` | Lấy danh sách thùng rác |
| POST | `/api/bin/{job_id}/restore` | Khôi phục mục đã xóa |
| DELETE | `/api/bin/{job_id}` | Xóa vĩnh viễn một mục |
| DELETE | `/api/bin` | Dọn sạch thùng rác |

## Trạng Thái Job

```text
PENDING -> PROCESSING -> COMPLETED
                    \-> FAILED

DRAFT là trạng thái riêng dùng cho bản nháp.
```

## Ghi Chú Phát Triển

- Database mặc định là SQLite file `prompt_builder.db` trong thư mục backend khi chạy local.
- SQLAlchemy có hỗ trợ đổi sang PostgreSQL bằng `SQLALCHEMY_DATABASE_URL`.
- Email verify token và rate limiter là in-memory, restart server sẽ mất trạng thái tạm.
- Các API tạo prompt yêu cầu user đã đăng nhập.
- `POST /api/generate` nhận `multipart/form-data` vì có thể upload PDF.
- Frontend lưu access token email/password trong `localStorage`; Google OAuth dùng cookie `access_token`.
- `frontend/src/pages/BinPage.tsx` vẫn tồn tại nhưng route `/bin` trong `App.tsx` hiện redirect về `/history`, vì thùng rác đã được tích hợp thành tab trong History.

## Build

```bash
cd frontend
npm run build
```

Lệnh này chạy TypeScript compiler và Vite build.

## Tác Giả

Đồ án môn học, phát triển bởi nhóm sinh viên.
