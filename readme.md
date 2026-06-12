# Prompt Builder

Ứng dụng web hỗ trợ tạo **Master Prompt** cho bài thuyết trình PowerPoint. Người dùng nhập mục đích, đối tượng, phong cách, nội dung hoặc file tài liệu; hệ thống dùng AI để phân tích và sinh prompt hoàn chỉnh có thể đưa vào ChatGPT, Claude, Gemini hoặc công cụ AI khác để tạo slide.

## Tổng quan chức năng

- Đăng ký, đăng nhập bằng email và mật khẩu.
- Xác thực email trước khi sử dụng tài khoản.
- Đăng nhập bằng Google OAuth.
- Sinh mô tả thiết kế slide ở giai đoạn 1 để người dùng xem và chỉnh sửa.
- Sinh Master Prompt ở giai đoạn 2 bằng background job.
- Upload nội dung từ PDF hoặc ảnh PNG, JPG, JPEG, WEBP.
- Trích xuất nội dung từ tài liệu, hỗ trợ OCR cho file scan.
- Lưu lịch sử các lần tạo prompt.
- Lưu bản nháp form tạo prompt.
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
| Xác thực | JWT, Argon2, Google OAuth |
| Email | SMTP hoặc in link xác thực ra console khi dev |
| Xử lý PDF | pypdf, pdf2image |
| OCR | Tesseract OCR, pytesseract, Pillow |
| Retry | tenacity |

## Kiến trúc tổng thể

```text
Prompt Builder
├── frontend/                 Ứng dụng React chạy trên trình duyệt
│   ├── Trang đăng nhập/đăng ký
│   ├── Trang tạo Master Prompt
│   ├── Trang lịch sử và thùng rác
│   └── API client gọi FastAPI backend
│
└── backend/                  API server FastAPI
    ├── Auth API              Đăng ký, đăng nhập, Google OAuth, user hiện tại
    ├── Prompt API            Sinh mô tả thiết kế, tạo job sinh prompt, poll job
    ├── History API           Danh sách lịch sử, xóa mềm, thùng rác
    ├── Draft API             Lưu, sửa, đọc bản nháp
    ├── Services              Xử lý nghiệp vụ, gọi Gemini, trích xuất nội dung
    ├── Workers               Chạy pipeline sinh prompt nền
    └── Database              Lưu user, provider xác thực, job, draft, history
```

Luồng chính khi tạo prompt:

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
Backend tạo Job và chạy worker nền
        |
        v
Worker trích xuất nội dung, gọi Gemini, ghép Master Prompt
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
├── backend/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth_router.py       API xác thực: đăng ký, đăng nhập, xác thực email, Google OAuth, logout
│   │   ├── draft_router.py      API lưu, cập nhật và đọc bản nháp
│   │   ├── history_router.py    API lịch sử, xóa mềm, thùng rác, khôi phục, xóa vĩnh viễn
│   │   └── prompt_router.py     API sinh mô tả thiết kế, tạo job sinh prompt, xem trạng thái job
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── dependencies.py      Dependency lấy user hiện tại từ JWT/cookie
│   │   ├── oauth.py             Cấu hình Authlib cho Google OAuth
│   │   └── security.py          Hash mật khẩu, tạo và kiểm tra JWT
│   │
│   ├── database/
│   │   ├── __init__.py
│   │   └── connection.py        Tạo engine SQLAlchemy, session và bảng dữ liệu
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── auth_provider.py     Model provider đăng nhập local hoặc Google
│   │   ├── job.py               Model job sinh prompt, draft, lịch sử, thùng rác
│   │   └── user.py              Model người dùng
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py              Schema request/response cho xác thực
│   │   ├── bin.py               Schema item trong thùng rác
│   │   ├── jobs.py              Schema job, lịch sử, bản nháp, trạng thái job
│   │   └── prompt.py            Schema dữ liệu sinh prompt và mô tả thiết kế
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py      Nghiệp vụ đăng ký, đăng nhập, xác thực email, Google login
│   │   ├── content_extractor.py Trích xuất text từ nội dung nhập, PDF và ảnh
│   │   ├── email_service.py     Gửi email xác thực hoặc fallback console
│   │   ├── job_history_service.py Chuyển đổi job sang dữ liệu history/bin, kiểm tra quyền sở hữu
│   │   └── llm_service.py       Gọi Gemini để sinh mô tả thiết kế và Master Prompt
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── config.py            Cấu hình đọc từ biến môi trường và file .env
│   │   └── rate_limiter.py      Theo dõi giới hạn đăng nhập và tạo prompt
│   │
│   ├── workers/
│   │   └── pipeline_worker.py   Worker chạy pipeline sinh prompt trong background thread
│   │
│   ├── main.py                  Entry point FastAPI, khai báo middleware và router
│   ├── requirements.txt         Danh sách thư viện Python
│   ├── test_ocr.py              Script kiểm thử OCR
│   ├── test.pdf                 File kiểm thử PDF
│   └── test.png                 File kiểm thử ảnh
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ProtectedRoute.tsx Route yêu cầu đăng nhập
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.tsx     Quản lý trạng thái đăng nhập toàn cục
│   │   │
│   │   ├── pages/
│   │   │   ├── AuthPage.css        CSS chung cho trang auth
│   │   │   ├── BinPage.tsx         Trang thùng rác
│   │   │   ├── CallbackPage.tsx    Xử lý callback sau Google OAuth
│   │   │   ├── GeneratePage.css    CSS trang tạo prompt
│   │   │   ├── GeneratePage.tsx    Form tạo prompt, upload file, lưu nháp, xem kết quả
│   │   │   ├── HistoryPage.css     CSS trang lịch sử
│   │   │   ├── HistoryPage.tsx     Danh sách lịch sử, lọc, xem lại kết quả, thao tác thùng rác
│   │   │   ├── LoginPage.tsx       Trang đăng nhập
│   │   │   └── RegisterPage.tsx    Trang đăng ký
│   │   │
│   │   ├── services/
│   │   │   └── api.ts              Axios instance và các hàm gọi API backend
│   │   │
│   │   ├── App.tsx                 Khai báo router frontend
│   │   ├── index.css               CSS toàn cục
│   │   ├── main.tsx                Entry point React
│   │   └── vite-env.d.ts           Type definition của Vite
│   │
│   ├── index.html
│   ├── package.json                Script và dependency frontend
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
│
├── .gitignore
├── deploy.md                      Ghi chú triển khai
├── main.py                        File Python cấp root
├── problem.md                     Mô tả bài toán/yêu cầu
├── readme.md                      Tài liệu cấu trúc đồ án
└── venv/                          Môi trường ảo Python local
```

## Backend

Backend nằm trong thư mục `backend/` và dùng FastAPI làm API server.

File quan trọng nhất là `backend/main.py`. File này:

- Tạo ứng dụng FastAPI.
- Tạo bảng cơ sở dữ liệu khi khởi động.
- Cấu hình CORS theo biến môi trường.
- Thêm `SessionMiddleware` để phục vụ Google OAuth.
- Gắn các router: prompt, auth, history, draft.
- Cung cấp endpoint health check tại `/`.

Các nhóm API chính:

| Nhóm | File | Chức năng |
|---|---|---|
| Authentication | `backend/api/auth_router.py` | Đăng ký, đăng nhập, xác thực email, Google OAuth, lấy thông tin user, logout |
| Prompt Generation | `backend/api/prompt_router.py` | Sinh mô tả thiết kế, tạo job sinh Master Prompt, xem trạng thái job |
| History | `backend/api/history_router.py` | Xem lịch sử, xóa mềm, xem thùng rác, khôi phục, xóa vĩnh viễn |
| Drafts | `backend/api/draft_router.py` | Lưu bản nháp, cập nhật bản nháp, lấy dữ liệu bản nháp |

## Frontend

Frontend nằm trong thư mục `frontend/` và dùng React + TypeScript + Vite.

File `frontend/src/App.tsx` khai báo các route:

| Route | Trang | Ghi chú |
|---|---|---|
| `/login` | `LoginPage` | Đăng nhập email/password hoặc Google |
| `/register` | `RegisterPage` | Đăng ký tài khoản |
| `/auth/callback` | `CallbackPage` | Nhận kết quả sau Google OAuth |
| `/generate` | `GeneratePage` | Trang chính để tạo Master Prompt, yêu cầu đăng nhập |
| `/history` | `HistoryPage` | Xem lịch sử, bản nháp, kết quả đã tạo, yêu cầu đăng nhập |
| `/bin` | Redirect về `/history` | Thùng rác được xử lý trong luồng history |
| `/` | Redirect về `/generate` | Trang mặc định |

File `frontend/src/services/api.ts` gom toàn bộ hàm gọi backend:

- `authAPI`: đăng ký, đăng nhập, xác thực email, lấy user hiện tại, logout, Google login URL.
- `promptAPI`: sinh mô tả thiết kế, tạo job sinh prompt, poll trạng thái job.
- `historyAPI`: lấy lịch sử, xóa mềm, lấy lại kết quả job.
- `draftAPI`: lưu, sửa, đọc bản nháp.
- `binAPI`: xem thùng rác, khôi phục, xóa vĩnh viễn, dọn thùng rác.

## Cơ sở dữ liệu

Các model chính nằm trong `backend/models/`:

- `User`: thông tin người dùng.
- `AuthProvider`: liên kết phương thức đăng nhập local hoặc Google với user.
- `Job`: lưu job sinh prompt, trạng thái xử lý, dữ liệu đầu vào, kết quả đầu ra, draft và trạng thái xóa mềm.

Backend mặc định dùng SQLite qua cấu hình:

```dotenv
SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db
```

Khi cần triển khai production có thể đổi sang PostgreSQL bằng URL tương ứng.

## API endpoints

### Authentication

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký bằng email và mật khẩu |
| POST | `/api/auth/login` | Đăng nhập và nhận access token |
| GET | `/api/auth/verify-email?token=...` | Xác thực email |
| GET | `/api/auth/google` | Bắt đầu đăng nhập Google |
| GET | `/api/auth/google/callback` | Callback từ Google OAuth |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |
| POST | `/api/auth/logout` | Đăng xuất |

### Prompt

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/generate-description` | Giai đoạn 1: sinh mô tả thiết kế |
| POST | `/api/generate` | Giai đoạn 2: tạo background job sinh Master Prompt |
| GET | `/api/jobs/{job_id}` | Lấy trạng thái và kết quả job |

Trạng thái job:

```text
PENDING -> PROCESSING -> COMPLETED
                      -> FAILED
```

Ngoài ra hệ thống dùng trạng thái `DRAFT` cho bản nháp.

### History, Draft, Bin

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/history` | Lấy danh sách lịch sử |
| DELETE | `/api/history/{job_id}` | Xóa mềm một item lịch sử |
| POST | `/api/drafts` | Lưu bản nháp mới |
| PUT | `/api/drafts/{job_id}` | Cập nhật bản nháp |
| GET | `/api/drafts/{job_id}` | Lấy dữ liệu bản nháp |
| GET | `/api/bin` | Lấy danh sách item trong thùng rác |
| POST | `/api/bin/{job_id}/restore` | Khôi phục item từ thùng rác |
| DELETE | `/api/bin/{job_id}` | Xóa vĩnh viễn một item |
| DELETE | `/api/bin` | Dọn toàn bộ thùng rác |

## Cấu hình môi trường

Tạo file `.env` trong thư mục `backend/` hoặc thư mục chạy server tùy cách khởi động.

```dotenv
# Môi trường
ENVIRONMENT=development

# Database
SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db

# Gemini
gemini_api_key=your_gemini_api_key
llm_model=gemini-2.5-flash
min_slides_limit=3
max_slides_limit=30

# JWT
JWT_SECRET_KEY=your_secret_key_min_32_chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# Frontend và CORS
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
BASE_URL=http://localhost:8000

# Rate limiting
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
MAX_GENERATE_ATTEMPTS=5
GENERATE_LOCKOUT_MINUTES=10

# Email verification
EMAIL_VERIFY_TTL_HOURS=24

# SMTP, để trống user/password khi dev nếu chỉ muốn in link ra console
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Prompt Builder
```

## Cài đặt và chạy

### Yêu cầu

- Python 3.11 hoặc mới hơn.
- Node.js 18 hoặc mới hơn.
- Tesseract OCR nếu muốn xử lý ảnh hoặc PDF scan.
- Poppler nếu muốn chuyển PDF scan sang ảnh để OCR.

### Chạy backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend mặc định chạy tại:

```text
http://localhost:8000
```

Tài liệu Swagger:

```text
http://localhost:8000/docs
```

### Chạy frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định theo cấu hình backend là:

```text
http://localhost:3000
```

Nếu Vite chạy cổng khác, cần cập nhật `FRONTEND_URL` và `ALLOWED_ORIGINS` trong `.env`.

## Ghi chú phát triển

- Token xác thực email và rate limit được xử lý trong bộ nhớ, nên có thể mất sau khi restart server.
- Job sinh Master Prompt chạy nền; frontend cần poll `/api/jobs/{job_id}` để lấy kết quả.
- File upload được kiểm tra extension, MIME type và chữ ký file.
- Các định dạng upload được hỗ trợ: PDF, PNG, JPG, JPEG, WEBP.
- Bản nháp được lưu như một job có trạng thái `DRAFT`.
- Xóa lịch sử là xóa mềm bằng `deleted_at`; item vẫn có thể khôi phục từ thùng rác.
- Xóa trong thùng rác là xóa vĩnh viễn khỏi database.

## Tài liệu liên quan

- `problem.md`: mô tả bài toán và yêu cầu đồ án.
- `deploy.md`: ghi chú triển khai.
- `backend/test_ocr.py`: kiểm thử OCR cục bộ.
