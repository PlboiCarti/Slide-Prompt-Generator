# Quick Start

Hướng dẫn cài đặt và chạy **Prompt Builder** từ đầu, bao gồm cài **Tesseract OCR** và **Poppler** — hai thành phần bắt buộc cho chức năng đọc nội dung từ ảnh và PDF scan.

## Mục lục

- [1. Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
- [2. Cài Tesseract OCR](#2-cài-tesseract-ocr)
- [3. Cài Poppler](#3-cài-poppler)
- [4. Cấu hình Backend (.env)](#4-cấu-hình-backend-env)
- [5. Chạy Backend](#5-chạy-backend)
- [6. Chạy Frontend](#6-chạy-frontend)
- [7. Kiểm tra OCR hoạt động](#7-kiểm-tra-ocr-hoạt-động)
- [8. Lỗi thường gặp](#8-lỗi-thường-gặp)

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| Tesseract OCR | mới nhất, kèm gói ngôn ngữ `vie` + `eng` |
| Poppler | mới nhất (cung cấp `pdftoppm`, `pdfinfo`) |

Tesseract dùng để OCR ảnh/PDF scan; Poppler dùng để chuyển từng trang PDF scan thành ảnh trước khi OCR (qua `pdf2image`). Thiếu 1 trong 2 thì việc upload PDF/ảnh vẫn nhận file nhưng sẽ báo lỗi khi trích xuất nội dung.

## 2. Cài Tesseract OCR

### Windows

1. Tải installer từ trang build cho Windows: https://github.com/UB-Mannheim/tesseract/wiki
2. Khi cài, ở bước **Additional language data (download)**, tick thêm **Vietnamese** (gói `eng` đã có sẵn mặc định).
3. Ghi nhớ đường dẫn cài đặt, mặc định là:
   ```
   C:\Program Files\Tesseract-OCR\tesseract.exe
   ```
4. Đường dẫn này sẽ dùng cho biến `TESSERACT_CMD` trong file `.env` (xem mục 4).

### macOS

```bash
brew install tesseract
brew install tesseract-lang   # cài đầy đủ gói ngôn ngữ, gồm vie + eng
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-vie
```

### Kiểm tra cài đặt

```bash
tesseract --version
tesseract --list-langs
```

Lệnh `--list-langs` phải hiển thị cả `eng` và `vie`. Nếu thiếu `vie`, cài lại và nhớ chọn thêm gói ngôn ngữ Tiếng Việt.

## 3. Cài Poppler

### Windows

1. Tải bản build cho Windows tại: https://github.com/oschwartz10612/poppler-windows/releases
2. Giải nén vào một thư mục cố định, ví dụ `C:\poppler`.
3. Bên trong có thư mục `Library\bin` chứa `pdftoppm.exe`, `pdfinfo.exe`... ví dụ:
   ```
   C:\poppler\Library\bin
   ```
4. Đường dẫn này dùng cho biến `POPPLER_PATH` trong `.env` (xem mục 4).

### macOS

```bash
brew install poppler
```

### Ubuntu / Debian

```bash
sudo apt install poppler-utils
```

### Kiểm tra cài đặt

```bash
pdftoppm -v
pdfinfo -v
```

Nếu 2 lệnh trên chạy được (in ra version) là Poppler đã sẵn sàng.

## 4. Cấu hình Backend (.env)

Tạo file `backend/.env` với nội dung mẫu sau, điều chỉnh giá trị cho phù hợp:

```dotenv
# Môi trường
ENVIRONMENT=development

# Database (SQLite mặc định, không cần chỉnh khi dev)
SQLALCHEMY_DATABASE_URL=sqlite:///./prompt_builder.db

# Gemini API — lấy key tại https://aistudio.google.com/app/apikey
gemini_api_key=your_gemini_api_key
llm_model=gemini-2.5-flash
min_slides_limit=3
max_slides_limit=30

# JWT — đổi sang chuỗi ngẫu nhiên >= 32 ký tự ở production
JWT_SECRET_KEY=dev_only_secret_key_change_in_production_2025
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Google OAuth (https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# Frontend / CORS
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Rate limiting
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
MAX_GENERATE_ATTEMPTS=5
GENERATE_LOCKOUT_MINUTES=10

# Email verification
EMAIL_VERIFY_TTL_HOURS=24

# SMTP — để trống user/password nếu chỉ muốn in link xác thực ra console khi dev
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Prompt Builder

# OCR — CHỈ cần khai báo nếu Tesseract/Poppler KHÔNG nằm trong PATH
# (thường gặp trên Windows). Để trống nếu đã thêm vào PATH hoặc dùng Linux/Docker.
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
POPPLER_PATH=C:\poppler\Library\bin
```

> Trên macOS/Linux nếu cài qua Homebrew/apt, Tesseract và Poppler thường đã nằm trong `PATH` — có thể để `TESSERACT_CMD` và `POPPLER_PATH` trống.

## 5. Chạy Backend

```bash
cd backend

# Tạo và kích hoạt virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Cài dependencies
pip install -r requirements.txt

# Chạy server
uvicorn main:app --reload
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

## 6. Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:3000

Vite proxy sẵn `/api` → `http://localhost:8000` (xem `frontend/vite.config.ts`), nên không cần cấu hình thêm khi chạy local.

## 7. Kiểm tra OCR hoạt động

1. Mở http://localhost:3000, đăng ký/đăng nhập, vào trang **Tạo Master Prompt**.
2. Ở bước nhập nội dung, upload một file ảnh (PNG/JPG) hoặc PDF scan có chữ.
3. Tạo prompt và theo dõi log backend (terminal chạy `uvicorn`):
   - Thấy log `Processing Image: ...` hoặc `Processing PDF: ...` rồi `... ký tự từ '...'` → OCR đã chạy và đọc được chữ.
   - Nếu báo lỗi liên quan Tesseract/Poppler, xem mục [8. Lỗi thường gặp](#8-lỗi-thường-gặp).

## 8. Lỗi thường gặp

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `tesseract is not installed or it's not in your PATH` | Chưa cài Tesseract hoặc chưa thêm vào PATH | Cài lại theo mục 2, hoặc set `TESSERACT_CMD` trong `.env` đúng đường dẫn `tesseract.exe` |
| `Unable to get page count. Is poppler installed and in PATH?` | Chưa cài Poppler hoặc chưa thêm vào PATH | Cài lại theo mục 3, hoặc set `POPPLER_PATH` trong `.env` đúng thư mục `bin` của Poppler |
| OCR chạy được nhưng không nhận chữ Tiếng Việt (ra ký tự lỗi) | Thiếu gói ngôn ngữ `vie` cho Tesseract | Cài thêm gói `tesseract-ocr-vie` (Linux) hoặc tick lại Vietnamese khi cài trên Windows (mục 2) |
| Upload file báo "File không đúng định dạng cho phép" | File không phải PDF/PNG/JPG/JPEG/WEBP, hoặc nội dung file không khớp đuôi file | Đổi sang đúng định dạng được hỗ trợ |
| Upload file báo vượt giới hạn dung lượng | File > 10MB | Dùng file nhỏ hơn 10MB |
