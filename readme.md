# Prompt Builder

Ứng dụng web hỗ trợ tạo **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục đích, đối tượng, phong cách, nội dung hoặc file tài liệu (PDF/ảnh); hệ thống dùng AI (Gemini) để phân tích và sinh ra một prompt hoàn chỉnh, có thể dán vào ChatGPT, Claude, Gemini hoặc công cụ AI khác để tạo slide.

> Hướng dẫn cài đặt chi tiết (bao gồm cài Tesseract OCR và Poppler): xem [QUICK_START.md](./QUICK_START.md).

## Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
- [Luồng xử lý chính](#luồng-xử-lý-chính)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình môi trường (.env)](#cấu-hình-môi-trường-env)
- [API Endpoints](#api-endpoints)
- [Ghi chú phát triển và giới hạn hiện tại](#ghi-chú-phát-triển-và-giới-hạn-hiện-tại)
- [License](#license)

## Tính năng chính

- Đăng ký, đăng nhập bằng email và mật khẩu.
- Xác thực email trước khi sử dụng tài khoản.
- Đăng nhập bằng Google OAuth.
- Sinh mô tả thiết kế slide ở giai đoạn 1 để người dùng xem và chỉnh sửa.
- Sinh Master Prompt ở giai đoạn 2 bằng background job.
- Upload nội dung từ PDF hoặc ảnh PNG, JPG, JPEG, WEBP (tối đa 10MB/file).
- Trích xuất nội dung từ tài liệu, hỗ trợ OCR song ngữ Việt/Anh cho file scan.
- Lưu lịch sử các lần tạo prompt, lưu bản nháp form tạo prompt.
- Xóa mềm vào thùng rác, khôi phục hoặc xóa vĩnh viễn.
- Giới hạn số lần đăng nhập sai và số lần tạo prompt để giảm spam.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Frontend | React 18, TypeScript, Vite |
| Routing frontend | React Router DOM |
| Gọi API frontend | Axios |
| Cơ sở dữ liệu | SQLAlchemy, mặc định SQLite |
| AI | Google Gemini API |
| Xác thực | JWT, Argon2, Google OAuth (Authlib) |
| Email | SMTP hoặc in link xác thực ra console khi dev |
| Xử lý PDF | pypdf, pdf2image |
| OCR | Tesseract OCR (pytesseract), Pillow, Poppler |
| Retry | tenacity |

## Kiến trúc tổng thể

```text
Prompt Builder
├── frontend/                 Ứng dụng React chạy trên trình duyệt
│   ├── Trang đăng nhập/đăng ký
│   ├── Trang tạo Master Prompt (2 giai đoạn)
│   ├── Trang lịch sử và thùng rác
│   └── API client gọi FastAPI backend
│
└── backend/                  API server FastAPI
    ├── Auth API              Đăng ký, đăng nhập, Google OAuth, user hiện tại
    ├── Prompt API            Sinh mô tả thiết kế, tạo job sinh prompt, poll job
    ├── History API           Danh sách lịch sử, xóa mềm, thùng rác
    ├── Draft API              Lưu, sửa, đọc bản nháp
    ├── Services              Xử lý nghiệp vụ, gọi Gemini, trích xuất nội dung (OCR)
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
│   │
│   ├── api/
│   │   ├── auth_router.py            /api/auth: đăng ký, đăng nhập, xác thực email, Google OAuth, me, logout
│   │   ├── draft_router.py           /api/drafts: lưu, cập nhật, đọc bản nháp
│   │   ├── history_router.py         /api/history, /api/bin: lịch sử, xóa mềm, thùng rác, khôi phục, xóa vĩnh viễn
│   │   └── prompt_router.py          /api/generate-description, /api/generate, /api/jobs/{job_id}
│   │
│   ├── core/
│   │   ├── dependencies.py           Dependency lấy user hiện tại từ JWT/cookie
│   │   ├── oauth.py                  Cấu hình Authlib cho Google OAuth
│   │   └── security.py               Hash mật khẩu (Argon2), tạo và kiểm tra JWT
│   │
│   ├── database/
│   │   └── connection.py             Engine SQLAlchemy, session, Base, tạo bảng
│   │
│   ├── models/
│   │   ├── auth_provider.py          Provider đăng nhập local hoặc Google
│   │   ├── job.py                    Job sinh prompt (cũng dùng cho draft, lịch sử, thùng rác)
│   │   └── user.py                   Người dùng
│   │
│   ├── schemas/
│   │   ├── auth.py                   Schema request/response xác thực
│   │   ├── bin.py                    Schema item trong thùng rác (PaginatedBinResponse)
│   │   ├── history.py                Schema lịch sử, phân trang, lưu bản nháp
│   │   ├── jobs.py                   JobStatus, GenerateResponse, JobStatusResponse
│   │   └── prompt.py                 Schema mô tả thiết kế và Master Prompt output
│   │
│   ├── services/
│   │   ├── auth_service.py           Nghiệp vụ đăng ký, đăng nhập, xác thực email, Google login
│   │   ├── content_extractor.py      Trích xuất text từ input, PDF (pypdf) và ảnh/PDF scan (Tesseract OCR vie+eng)
│   │   ├── email_service.py          Gửi email xác thực hoặc fallback in ra console
│   │   ├── job_history_service.py    Chuyển đổi job sang dữ liệu history/bin, kiểm tra quyền sở hữu
│   │   └── llm_service.py            Gọi Gemini để sinh mô tả thiết kế và Master Prompt
│   │
│   ├── utils/
│   │   ├── config.py                 Cấu hình đọc từ .env (pydantic-settings)
│   │   ├── rate_limiter.py           Theo dõi giới hạn đăng nhập và tạo prompt (in-memory)
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
    └── src/
        ├── main.tsx
        ├── App.tsx                   Khai báo route (React Router)
        ├── index.css
        ├── components/
        │   └── ProtectedRoute.tsx    Bảo vệ route cần đăng nhập
        ├── context/
        │   └── AuthContext.tsx       Quản lý state đăng nhập toàn cục
        ├── pages/
        │   ├── LoginPage.tsx / AuthPage.css
        │   ├── RegisterPage.tsx
        │   ├── CallbackPage.tsx      Callback cho Google OAuth
        │   ├── GeneratePage.tsx / GeneratePage.css   Form tạo Master Prompt (2 giai đoạn)
        │   └── HistoryPage.tsx / HistoryPage.css     Lịch sử và thùng rác
        ├── services/
        │   └── api.ts                Axios instance + các API call
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
# Tạo file .env (xem mục Cấu hình môi trường bên dưới)
uvicorn main:app --reload
# → http://localhost:8000   (Swagger: /docs)
```

```bash
# Frontend — terminal 2
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Cấu hình môi trường (.env)

File `.env` đặt trong `backend/`. Toàn bộ biến và giá trị mặc định khai báo tại `backend/utils/config.py`.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` hoặc `production`. Production bắt buộc đổi `JWT_SECRET_KEY`. |
| `SQLALCHEMY_DATABASE_URL` | `sqlite:///./prompt_builder.db` | Đổi sang Postgres khi cần: `postgresql://user:pass@host:5432/dbname` |
| `gemini_api_key` | _(rỗng)_ | API key Google Gemini |
| `llm_model` | `gemini-2.5-flash` | Model Gemini dùng để sinh prompt |
| `min_slides_limit` / `max_slides_limit` | `3` / `30` | Giới hạn số slide cho phép |
| `JWT_SECRET_KEY` | _(dev key mẫu)_ | Khóa ký JWT — **phải đổi** ở production |
| `JWT_ALGORITHM` | `HS256` | Thuật toán JWT |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Thời hạn access token (phút) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | _(rỗng)_ | Lấy từ Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/google/callback` | Callback URL OAuth |
| `FRONTEND_URL` | `http://localhost:3000` | URL frontend, dùng trong link email |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Danh sách origin CORS, phân tách bằng dấu phẩy |
| `BASE_URL` | `http://localhost:8000` | URL backend, dùng trong link email |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | `5` / `15` | Giới hạn đăng nhập sai |
| `MAX_GENERATE_ATTEMPTS` / `GENERATE_LOCKOUT_MINUTES` | `5` / `10` | Giới hạn số lần tạo prompt |
| `EMAIL_VERIFY_TTL_HOURS` | `24` | Thời hạn link xác thực email |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `587` | SMTP server gửi email |
| `SMTP_USER` / `SMTP_PASSWORD` | _(rỗng)_ | Để trống → dev mode, in link xác thực ra console |
| `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` | _(rỗng)_ / `Prompt Builder` | Thông tin người gửi email |
| `TESSERACT_CMD` | _(rỗng)_ | Đường dẫn `tesseract.exe` — chỉ cần set nếu không có trong PATH (thường gặp trên Windows) |
| `POPPLER_PATH` | _(rỗng)_ | Đường dẫn thư mục `bin` của Poppler — chỉ cần set nếu không có trong PATH (thường gặp trên Windows) |

## API Endpoints

Tất cả endpoint có prefix `/api`. Swagger UI: `http://localhost:8000/docs`.

### Auth — `/api/auth`

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/register` | Đăng ký tài khoản bằng email/mật khẩu |
| POST | `/auth/login` | Đăng nhập, trả về JWT |
| GET | `/auth/verify-email` | Xác thực email qua token gửi trong link |
| GET | `/auth/google` | Bắt đầu luồng đăng nhập Google OAuth |
| GET | `/auth/google/callback` | Callback nhận kết quả từ Google |
| GET | `/auth/me` | Lấy thông tin user hiện tại |
| POST | `/auth/logout` | Đăng xuất |

### Prompt — `/api`

| Method | Path | Mô tả |
|---|---|---|
| POST | `/generate-description` | Giai đoạn 1: Gemini sinh mô tả thiết kế (tone, font, density, visual...) |
| POST | `/generate` | Giai đoạn 2: tạo Job, upload file, chạy worker sinh Master Prompt |
| GET | `/jobs/{job_id}` | Poll trạng thái và kết quả của Job |

### History & Bin — `/api`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/history` | Danh sách lịch sử (phân trang) |
| DELETE | `/history/{job_id}` | Xóa mềm — chuyển vào thùng rác |
| GET | `/bin` | Danh sách thùng rác (phân trang) |
| POST | `/bin/{job_id}/restore` | Khôi phục item từ thùng rác |
| DELETE | `/bin/{job_id}` | Xóa vĩnh viễn 1 item |
| DELETE | `/bin` | Xóa vĩnh viễn toàn bộ thùng rác |

### Drafts — `/api`

| Method | Path | Mô tả |
|---|---|---|
| POST | `/drafts` | Lưu bản nháp mới (Job với status `DRAFT`) |
| PUT | `/drafts/{job_id}` | Cập nhật bản nháp |
| GET | `/drafts/{job_id}` | Đọc bản nháp |

## Ghi chú phát triển và giới hạn hiện tại

- Token xác thực email và rate limit được lưu **in-memory** — mất sau khi restart server.
- Job sinh Master Prompt chạy trong **background thread** (`run_pipeline_in_thread`), không dùng queue/Redis — phù hợp single-instance, đơn giản hóa cho đồ án.
- File upload lưu tạm tại `backend/uploads/{job_id}/`, được dọn ngay sau khi job xử lý xong; `utils/upload_cleanup.py` quét và xóa thêm các thư mục tồn đọng quá 24h mỗi khi app khởi động.
- File upload được kiểm tra extension, MIME type và magic bytes; định dạng hỗ trợ: PDF, PNG, JPG, JPEG, WEBP; tối đa 10MB/file.
- Database mặc định SQLite (`prompt_builder.db`); đổi sang Postgres qua `SQLALCHEMY_DATABASE_URL` khi cần nhiều kết nối đồng thời.
- Xóa lịch sử là xóa mềm bằng `deleted_at`; xóa trong thùng rác là xóa vĩnh viễn khỏi database.

## License

Dự án phục vụ mục đích học tập/đồ án, chưa công bố license chính thức.
