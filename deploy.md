# Hướng dẫn Deploy

## Stack cần deploy

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend | FastAPI + Uvicorn | Python, cần persistent process |
| Frontend | React + Vite | Static files sau khi build |
| Database | SQLite (dev) → cần Postgres | SQLite không dùng được trên ephemeral host |
| Jobs | Daemon threads in-memory | OK với single server |
| Rate limit | In-memory | Sẽ reset khi restart — chấp nhận được |

---

## Lựa chọn A — Railway (~$5/tháng, đơn giản nhất)

Một platform quản lý tất cả: backend, Postgres, frontend.

```
GitHub repo → Railway
  ├── Service: backend  (Python, uvicorn)
  ├── Service: frontend (Node build → static serve)
  └── Plugin:  PostgreSQL (Postgres tự động)
```

**Ưu điểm:** Setup nhanh nhất, không cần cấu hình phức tạp, auto-deploy từ GitHub push.

---

## Lựa chọn B — Miễn phí hoàn toàn

| Phần | Platform | Free tier |
|---|---|---|
| Frontend | **Vercel** | Miễn phí, tốt nhất cho Vite/React |
| Backend | **Render** | Miễn phí (spin down sau 15 phút không dùng) |
| Database | **Neon.tech** | Postgres miễn phí 0.5 GB |

---

## Những thứ cần thay đổi trước khi deploy

### 1. Đổi database: SQLite → Postgres

Chỉ cần thay biến môi trường `SQLALCHEMY_DATABASE_URL` trong `.env` production:

```env
SQLALCHEMY_DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Code đã tự động detect SQLite vs Postgres trong `database/connection.py` — không cần sửa code.

### 2. Bảo vệ secrets — KHÔNG commit `.env` lên GitHub

File `.env` hiện chứa:
- `GEMINI_API_KEY`
- `JWT_SECRET_KEY`
- `GOOGLE_CLIENT_SECRET`
- `SMTP_PASSWORD`

Kiểm tra `.gitignore` đã có `.env` chưa. Các secrets này phải được set trực tiếp trên dashboard của hosting platform (Railway / Render / Vercel).

### 3. Cập nhật CORS cho domain production

Thêm domain thật vào biến `ALLOWED_ORIGINS` trong `.env` production:

```env
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-domain.com
FRONTEND_URL=https://your-frontend.vercel.app
BASE_URL=https://your-backend.railway.app
```

### 4. Cập nhật Google OAuth redirect URI

Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client → thêm:

```
https://your-backend.railway.app/api/auth/google/callback
```

Và cập nhật trong `.env` production:

```env
GOOGLE_REDIRECT_URI=https://your-backend.railway.app/api/auth/google/callback
```

### 5. Đổi JWT_SECRET_KEY mạnh hơn cho production

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Set `ENVIRONMENT=production` để bật production guard kiểm tra JWT key.

---

## Environment variables cần set trên hosting platform

### Backend

```env
ENVIRONMENT=production
SQLALCHEMY_DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
JWT_SECRET_KEY=<32-char random string>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-backend/api/auth/google/callback
FRONTEND_URL=https://your-frontend
ALLOWED_ORIGINS=https://your-frontend
BASE_URL=https://your-backend
SMTP_USER=...
SMTP_PASSWORD=...
```

### Frontend

```env
VITE_API_URL=https://your-backend/api
```

---

## Lệnh start cho backend (production)

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

> Không dùng `--reload` trên production.
