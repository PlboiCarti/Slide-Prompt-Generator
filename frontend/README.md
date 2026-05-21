# Frontend - Prompt Builder

React + TypeScript frontend cho Prompt Builder

## Setup

### 1. Cài đặt dependencies
```bash
cd frontend
npm install
```

### 2. Tạo .env
```bash
cp .env.example .env
```

### 3. Chạy dev server
```bash
npm run dev
```

Frontend sẽ chạy tại `http://localhost:3000`

### 4. Build cho production
```bash
npm run build
```

## Requirements

- Backend phải chạy tại `http://localhost:8000`
- Redis phải sẵn sàng (backend sẽ check)
- Database phải được setup qua `python main.py` hoặc Alembic

## Tính năng

- ✅ Đăng nhập/Đăng ký với email/password
- ✅ Google OAuth 2.0
- ✅ Sinh Prompt từ text hoặc PDF
- ✅ Kiểm tra status job async
- ✅ Real-time polling status

## Kiến trúc

```
src/
├── components/        # React components
├── pages/             # Page components
├── context/           # Auth context (state management)
├── services/          # API client
├── App.tsx            # Main router
├── main.tsx           # Entry point
└── index.css          # Global styles
```

## Testing

### 1. Test Register + Login

1. Vào `http://localhost:3000/register`
2. Nhập email, password
3. Đăng ký thành công
4. Vào `http://localhost:3000/login`
5. Nhập email, password
6. Đăng nhập thành công → redirect `/generate`

### 2. Test Generate Prompt

1. Nhập form: purpose, audience, content
2. Click "Sinh Prompt"
3. Theo dõi status realtime
4. Khi COMPLETED, xem kết quả

### 3. Test Google OAuth

1. Click "Đăng nhập bằng Google"
2. Làm theo flow Google
3. Sẽ redirect về frontend + set cookie
4. Tự động đăng nhập

## Troubleshooting

**CORS error?**
- Kiểm tra backend CORS config trong `backend/main.py`
- Frontend URL phải được allow

**Token không work?**
- Check localStorage `access_token`
- Xem network tab request `/auth/me`

**Google OAuth không work?**
- Kiểm tra GOOGLE_REDIRECT_URI env var
- Kiểm tra Google OAuth credentials
