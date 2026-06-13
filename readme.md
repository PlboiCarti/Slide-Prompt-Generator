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

# Tạo và kích hoạt virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Cài dependencies
pip install -r requirements.txt

# Tạo file .env (xem mục Cấu hình bên dưới)

# Chạy server
uvicorn main:app --reload
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

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

# Google OAuth (https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# Frontend
FRONTEND_URL=http://localhost:5173

# Rate limiting — đăng nhập
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
