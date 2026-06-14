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

Copy file mẫu rồi điền giá trị cho phù hợp:

```bash
cd backend
cp .env.example .env           # macOS/Linux
# copy .env.example .env       # Windows (cmd)
```

Toàn bộ biến môi trường và mô tả chi tiết đã có sẵn trong `backend/.env.example` (kèm comment giải thích) và trong [readme.md → Cấu hình môi trường](./readme.md#cấu-hình-môi-trường). Tối thiểu cần điền `gemini_api_key` để chức năng sinh prompt hoạt động.

Riêng cho OCR — phần liên quan trực tiếp đến hướng dẫn này — `.env.example` có 2 biến cuối:

```dotenv
# OCR — CHỈ cần khai báo nếu Tesseract/Poppler KHÔNG nằm trong PATH
# (thường gặp trên Windows). Để trống nếu đã thêm vào PATH hoặc dùng Linux/Docker.
TESSERACT_CMD=
POPPLER_PATH=
```

Nếu bạn cài Tesseract/Poppler trên Windows theo mục 2 và 3 ở trên và KHÔNG thêm vào PATH, điền 2 đường dẫn đã ghi nhớ ở trên vào đây, ví dụ:

```dotenv
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
cp .env.example .env           # macOS/Linux — copy .env.example .env trên Windows (cmd)
npm run dev
```

- App: http://localhost:3000

Vite proxy sẵn `/api` → `http://localhost:8000` (xem `frontend/vite.config.ts`), và `frontend/.env.example` đã có `VITE_API_URL=http://localhost:8000/api` mặc định — không cần chỉnh thêm khi chạy local.

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
