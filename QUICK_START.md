# Quick Start

Hướng dẫn cài đặt và chạy **Prompt Builder** từ đầu trên Windows, macOS và Linux — bao gồm cài **Tesseract OCR** và **Poppler** (bắt buộc cho OCR PDF/ảnh), và walkthrough từng bước của Builder Console.

## Mục lục

- [1. Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
- [2. Cài Tesseract OCR](#2-cài-tesseract-ocr)
- [3. Cài Poppler](#3-cài-poppler)
- [4. Cấu hình Backend (.env)](#4-cấu-hình-backend-env)
- [5. Chạy Backend](#5-chạy-backend)
- [6. Cấu hình Frontend (.env)](#6-cấu-hình-frontend-env)
- [7. Chạy Frontend](#7-chạy-frontend)
- [8. Walkthrough Builder Console (4 bước UI)](#8-walkthrough-builder-console-4-bước-ui)
- [9. Kiểm tra OCR hoạt động](#9-kiểm-tra-ocr-hoạt-động)
- [10. Lỗi thường gặp](#10-lỗi-thường-gặp)

---

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| Tesseract OCR | mới nhất, kèm gói ngôn ngữ `vie` + `eng` |
| Poppler | mới nhất (cung cấp `pdftoppm`, `pdfinfo`) |

Tesseract OCR chạy ảnh/PDF scan qua mạng thần kinh; Poppler chuyển từng trang PDF thành ảnh trước khi Tesseract xử lý (qua `pdf2image`). Thiếu một trong hai thì upload file vẫn nhận nhưng trích xuất nội dung sẽ thất bại.

---

## 2. Cài Tesseract OCR

### Windows

1. Tải installer từ: https://github.com/UB-Mannheim/tesseract/wiki
2. Trong bước **Additional language data (download)**, tick thêm **Vietnamese** (`vie`). Gói `eng` có sẵn mặc định.
3. Mặc định sẽ cài vào:
   ```
   C:\Program Files\Tesseract-OCR\tesseract.exe
   ```
4. Nếu KHÔNG thêm đường dẫn này vào PATH, điền vào `TESSERACT_CMD` trong `.env` (xem mục 4).

### macOS

```bash
brew install tesseract
brew install tesseract-lang   # gồm đầy đủ vie + eng
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-vie
```

### Kiểm tra

```bash
tesseract --version
tesseract --list-langs        # phải có cả eng và vie
```

---

## 3. Cài Poppler

### Windows

1. Tải bản build tại: https://github.com/oschwartz10612/poppler-windows/releases
2. Giải nén vào thư mục cố định, ví dụ `C:\poppler`.
3. Thư mục chứa `pdftoppm.exe` thường là:
   ```
   C:\poppler\Library\bin
   ```
4. Nếu KHÔNG thêm vào PATH, điền vào `POPPLER_PATH` trong `.env` (xem mục 4).

### macOS

```bash
brew install poppler
```

### Ubuntu / Debian

```bash
sudo apt install poppler-utils
```

### Kiểm tra

```bash
pdftoppm -v
pdfinfo -v
```

---

## 4. Cấu hình Backend (.env)

```bash
cd backend
cp .env.example .env           # macOS/Linux
# copy .env.example .env       # Windows (cmd)
```

Mở `backend/.env` và điền ít nhất các biến sau:

```dotenv
# Bắt buộc
GEMINI_API_KEY=your_gemini_api_key_here

# Đường dẫn OCR — chỉ cần trên Windows nếu không thêm vào PATH
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
POPPLER_PATH=C:\poppler\Library\bin
```

Để trống `TESSERACT_CMD` và `POPPLER_PATH` nếu đã thêm vào PATH hoặc đang dùng macOS/Linux với Homebrew/apt.

Để trống `SMTP_USER` / `SMTP_PASSWORD` trong dev — link xác thực email sẽ được in ra console uvicorn thay vì gửi qua mail.

Toàn bộ biến môi trường và giá trị mặc định: xem `backend/.env.example` và `backend/utils/config.py`.

---

## 5. Chạy Backend

```bash
cd backend

# Tạo và kích hoạt virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Cài dependencies
pip install -r requirements.txt

# Khởi động
uvicorn main:app --reload
```

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

Khi server khởi động thành công sẽ thấy log `Application startup complete.` và tự động tạo file `database.db` (SQLite mặc định) nếu chưa có.

---

## 6. Cấu hình Frontend (.env)

```bash
cd frontend
cp .env.example .env           # macOS/Linux
# copy .env.example .env       # Windows (cmd)
```

File `.env.example` đã có sẵn `VITE_API_URL=http://localhost:8000/api`. Không cần chỉnh khi chạy local — Vite cũng proxy `/api` → `http://localhost:8000` qua `vite.config.ts`.

---

## 7. Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: `http://localhost:3000`

Để kiểm tra TypeScript và build production:

```bash
npm run build    # tsc (strict mode) + vite build → dist/
npm run preview  # preview bản build tại http://localhost:4173
```

---

## 8. Walkthrough Builder Console (4 bước UI)

Sau khi đăng ký / đăng nhập, vào trang **Tạo Master Prompt** (`/generate`). Trang chia thành 4 bước rõ ràng:

---

### Bước 1 — Project Brief (Nội dung bài thuyết trình)

Điền 6 trường định hướng thiết kế:

| Trường | Mô tả | Ghi chú |
|---|---|---|
| **Mục đích** (`purpose`) | Mục tiêu bài trình bày | Tối thiểu 3 ký tự để kích hoạt Phase 1 và lưu draft |
| **Đối tượng** (`audience`) | Người nghe mục tiêu | Tối thiểu 3 ký tự |
| **Phong cách** (`style`) | Chọn 1 trong 9 preset card hoặc nhập tự do | Thay đổi style/layout/color → xóa Design Direction cũ để buộc chạy lại Phase 1 |
| **Bố cục** (`primary_layout`) | Chọn 1 trong 9 preset layout card | |
| **Màu chủ đạo** (`primary_color`) | Color picker + 5 preset màu | |
| **Số lượng slide** (`slide_count`) | Thanh kéo 6–30, preset: 8/10/15/20 | |

Nhấn **"Phân tích Định hướng Thiết kế"** để gửi `POST /api/generate-description`.

---

### Bước 2 — AI Design Direction (Xem và chỉnh thiết kế)

Sau khi Phase 1 hoàn tất (~3–5 giây), Spec Sheet hiện ra với 3 phần có thể chỉnh trực tiếp:

**Color Palette (Bảng màu):**
- Grid 3×2 gồm 6 swatch: **Primary** (khóa, chỉ đọc), **Secondary**, **Accent**, **Neutral 1/2/3** (có thể đổi màu bằng color picker ẩn sau circle).
- Mỗi swatch hiển thị hex code, tên vai trò và mô tả chức năng sử dụng (tỉ lệ diện tích khuyến nghị).
- Text contrast tự động flip sang dark/light tùy theme qua CSS custom properties.

**Typography Spec Sheet (Kiểu chữ):**
- 3 trường meta: **Font Family**, **Font Category**, **Weights Allowed**.
- 4 role card: **Tiêu đề slide**, **Eyebrow / Kicker**, **Thân bài (Body)**, **Hỗ trợ (Italic)**.
- Mỗi card có: preview "Aa" (weight phản ánh đúng giá trị), Size (pt), Weight, Màu chữ (swatch inline), Ghi chú (textarea full-width có thể mở rộng).
- Focus-within card → glow cyan.

**AI Design Direction (4 thẻ):**
- **Giọng điệu** (`tone`), **Quy tắc thông điệp** (`key_message_rule`), **Mật độ** (`density`), **Hướng dẫn hình ảnh** (`visual`) — mỗi thẻ là glassmorphic card với textarea tự do.
- Gõ vào direction cards **không làm re-render** Palette hoặc Typography (memo isolation).

---

### Bước 3 — Source Content (Nội dung nguồn)

| Input | Mô tả |
|---|---|
| **Nội dung văn bản** | Textarea lớn — gõ hoặc paste nội dung thô. Typing không trigger re-render toàn trang (decoupled via `contentLocal` + `contentLatestRef`). `Ctrl/Cmd+Enter` submit. |
| **Upload file** | Kéo thả hoặc chọn file PDF/PNG/JPG/JPEG/WEBP, tối đa 10 MB/file, nhiều file. |

Phải có ít nhất một trong hai (văn bản hoặc file) trước khi submit Phase 2.

---

### Bước 4 — Generate & Result

Nhấn **"Tạo Master Prompt"** → `POST /api/generate` → frontend bắt đầu poll `GET /api/jobs/{job_id}` mỗi **2 giây**.

Progress bar và status label cập nhật theo:

| Status | Hiển thị |
|---|---|
| `PENDING` | Đang chuẩn bị... |
| `PROCESSING` | AI đang phân tích nội dung và tạo cấu trúc slide... |
| `COMPLETED` | Hoàn tất — trang tự scroll đến kết quả |
| `FAILED` | Hiển thị error message từ backend |

Khi `COMPLETED`:
- Nút **"Sao chép"** copy `full_master_prompt` vào clipboard (fallback `execCommand` cho môi trường không hỗ trợ Clipboard API).
- Prompt được lưu tự động vào lịch sử.
- Nút **"Tạo mới"** reset toàn bộ job state, giữ nguyên form.

---

### Draft

Bất kỳ lúc nào (kể cả trước Phase 1 và sau Phase 2), nhấn **"Lưu thành bản nháp"** để lưu toàn bộ trạng thái hiện tại:

```
Lần đầu  →  POST /api/drafts   →  nhận draft ID, lưu vào state
Lần sau  →  PUT  /api/drafts/{id}  →  cập nhật bản nháp cũ
```

Mở lại draft từ **Lịch sử** → toàn bộ form, file list (tên), Design Direction và draft ID được hydrate lại qua `location.state`.

---

## 9. Kiểm tra OCR hoạt động

1. Đăng nhập, vào **Tạo Master Prompt**.
2. Ở Bước 3, upload một ảnh PNG/JPG hoặc PDF scan có chữ Tiếng Việt.
3. Submit Phase 2, theo dõi log `uvicorn`:
   - `Processing Image: ...` hoặc `Processing PDF: ...` → đang OCR.
   - `... ký tự từ '...'` → OCR thành công và đọc được chữ.
   - Lỗi liên quan Tesseract/Poppler → xem mục 10.

---

## 10. Lỗi thường gặp

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `tesseract is not installed or it's not in your PATH` | Tesseract chưa cài hoặc chưa có trong PATH | Cài theo mục 2; hoặc set `TESSERACT_CMD` trong `.env` đúng đường dẫn `tesseract.exe` |
| `Unable to get page count. Is poppler installed and in PATH?` | Poppler chưa cài hoặc chưa có trong PATH | Cài theo mục 3; hoặc set `POPPLER_PATH` trong `.env` đúng thư mục `bin` của Poppler |
| OCR chạy nhưng ra ký tự lỗi / không nhận Tiếng Việt | Thiếu gói ngôn ngữ `vie` | Cài thêm `tesseract-ocr-vie` (Linux) hoặc tick Vietnamese khi cài trên Windows (mục 2) |
| `File không đúng định dạng cho phép` | Không phải PDF/PNG/JPG/JPEG/WEBP, hoặc nội dung file không khớp extension | Đổi sang đúng định dạng được hỗ trợ |
| `File vượt quá giới hạn dung lượng` | File > 10 MB | Dùng file nhỏ hơn 10 MB |
| `Vui lòng điền đầy đủ Mục đích và Đối tượng` | Hai trường bắt buộc còn trống | Điền cả hai trước khi nhấn "Phân tích Định hướng Thiết kế" |
| `Cần nhập mục đích và đối tượng trước khi lưu Draft` | Draft yêu cầu tối thiểu 3 ký tự ở mỗi trường | Điền brief trước khi lưu |
| Lỗi rate limit khi tạo prompt | Đã vượt `MAX_GENERATE_ATTEMPTS` trong `GENERATE_LOCKOUT_MINUTES` phút | Đợi hết lockout (Phase 1 và Phase 2 dùng chung bộ đếm) |
| Server khởi động báo `JWT_SECRET_KEY` | `ENVIRONMENT=production` nhưng key vẫn là `dev_only_*` | Tạo key ngẫu nhiên: `python -c "import secrets; print(secrets.token_hex(32))"` và điền vào `.env` |
