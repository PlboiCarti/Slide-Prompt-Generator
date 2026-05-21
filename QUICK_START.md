# Quick Start Guide — Prompt Builder

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Backend | Python + FastAPI + Uvicorn |
| Database | SQLite (file local) |
| AI | Google Gemini API |
| Auth | JWT + bcrypt + Google OAuth |
| Rate Limiting | In-memory (không cần Redis) |
| Frontend | React + Vite |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Git

---

## Cấu trúc thư mục

```
PromptBuilder/
├── backend/
│   ├── main.py
│   ├── .env
│   ├── requirements.txt
│   ├── api/
│   ├── core/
│   ├── database/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── utils/
│   └── workers/
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
```

---

## Setup Backend (5 phút)

### 1. Tạo Virtual Environment

```bash
cd backend

# Tạo venv
python -m venv venv

# Kích hoạt (Windows)
venv\Scripts\activate

# Kích hoạt (Mac/Linux)
source venv/bin/activate
```

### 2. Cài dependencies

```bash
pip install -r requirements.txt
```

### 3. Tạo file `.env`

Tạo file `.env` trong thư mục `backend/`:

```dotenv
# ==================== GEMINI ====================
GEMINI_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-2.5-flash

# ==================== DATABASE ====================
# SQLite - tự động tạo file database.db
SQLALCHEMY_DATABASE_URL=sqlite:///./database.db

# ==================== JWT ====================
# Tạo bằng: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=your_secret_key_here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# ==================== GOOGLE OAUTH ====================
# Lấy từ: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# ==================== FRONTEND ====================
FRONTEND_URL=http://localhost:5173

# ==================== RATE LIMITING ====================
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
```

### 4. Chạy Backend

```bash
# Đảm bảo đang ở thư mục backend/ và venv đã kích hoạt
uvicorn main:app --reload
```

Database SQLite (`database.db`) sẽ tự động được tạo khi app khởi động.

Kiểm tra hoạt động:
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/

---

## Setup Frontend (3 phút)

### 1. Cài dependencies

```bash
cd frontend
npm install
```

### 2. Chạy Frontend

```bash
npm run dev
```

Mở trình duyệt: http://localhost:5173

---

## Chạy cả 2 cùng lúc

Mở **2 terminal riêng biệt**:

```bash
# Terminal 1 — Backend
cd backend
venv\Scripts\activate   # Windows
uvicorn main:app --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

---

## Testing

### Đăng ký tài khoản

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "username": "testuser"
  }'
```

### Lấy verify token

Sau khi register, nhìn vào **terminal backend**, tìm dòng:

```
[DEV] Verify link: http://localhost:8000/api/auth/verify-email?token=xxxx
```

Dán link đó lên browser để xác thực email.

### Đăng nhập

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
# Response: { "access_token": "...", "user": {...} }
```

### Tạo Master Prompt

```bash
curl -X POST http://localhost:8000/api/generate \
  -F "purpose=pitch" \
  -F "audience=investor" \
  -F "style=minimalist" \
  -F "primary_color=#FF6B35" \
  -F "slide_count=6" \
  -F "primary_layout=key_message" \
  -F "language=vi" \
  -F "content=Công ty chúng tôi tăng trưởng 45% năm nay"
# Response: { "job_id": "...", "status": "PENDING" }
```

### Kiểm tra trạng thái job

```bash
curl http://localhost:8000/api/jobs/{job_id}
# Status: PENDING → PROCESSING → COMPLETED
```

### Đăng nhập Google OAuth

Mở trình duyệt, truy cập:
```
http://localhost:8000/api/auth/google
```

---

## Xem Database

Database là file SQLite, dùng lệnh sau để xem:

```bash
# Windows (cài SQLite từ https://sqlite.org/download.html)
sqlite3 backend/database.db

# Các lệnh hay dùng
.tables                    -- Xem danh sách bảng
SELECT * FROM users;       -- Xem tất cả users
SELECT * FROM jobs;        -- Xem tất cả jobs
SELECT * FROM auth_providers;  -- Xem auth providers
.quit                      -- Thoát
```

Hoặc dùng extension **SQLite Viewer** trên VS Code để xem trực quan.

---

## Troubleshooting

### Lỗi `ModuleNotFoundError`

```bash
# Đảm bảo venv đã kích hoạt
venv\Scripts\activate  # Windows

# Cài lại dependencies
pip install -r requirements.txt
```

### Lỗi `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

Kiểm tra file `.env` đã được điền đầy đủ. Nếu chưa có Google OAuth, có thể để:
```dotenv
GOOGLE_CLIENT_ID=placeholder
GOOGLE_CLIENT_SECRET=placeholder
```

### Lỗi `422 Unprocessable Entity`

JSON gửi lên bị lỗi cú pháp. Kiểm tra lại định dạng JSON trong request body.

### Lỗi `401 Unauthorized`

Token hết hạn hoặc không hợp lệ. Đăng nhập lại để lấy token mới.

### Lỗi `429 Too Many Requests`

Đăng nhập sai quá 5 lần, tài khoản bị khóa 15 phút.
**Lưu ý:** Rate limit lưu in-memory, **tự reset khi restart uvicorn**.

### Frontend không kết nối được Backend

Kiểm tra backend đang chạy ở `http://localhost:8000` và CORS đã được cấu hình đúng trong `main.py`.

---

## Lưu ý quan trọng

| Vấn đề | Giải thích |
|---|---|
| **Verify token mất sau restart** | Token xác thực email lưu in-memory. Nếu restart uvicorn, phải register lại. |
| **Rate limit reset khi restart** | Bộ đếm đăng nhập sai cũng lưu in-memory. |
| **Database giữ nguyên** | SQLite là file, không bị mất khi restart. |
| **Gemini rate limit** | Model `gemini-2.5-flash` giới hạn 5 req/phút. Job xử lý có `time.sleep(12)` để tránh lỗi. |

---

## Google Cloud Console Setup

Để Google OAuth hoạt động:

1. Vào https://console.cloud.google.com/apis/credentials
2. Tạo **OAuth 2.0 Client ID** (loại Web application)
3. Thêm **Authorized redirect URIs**:
   ```
   http://localhost:8000/api/auth/google/callback
   ```
4. Copy `Client ID` và `Client Secret` vào `.env`