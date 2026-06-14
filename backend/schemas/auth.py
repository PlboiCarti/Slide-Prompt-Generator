"""
schemas/auth.py — Pydantic schemas cho auth
"""
from pydantic import BaseModel, EmailStr, Field


# ── INPUT (request body) ──────────────────────────────────────────────
class UserRegister(BaseModel):
    """Body khi user đăng ký bằng email/password."""
    email: EmailStr
    # 128: chặn input quá dài gây tốn tài nguyên khi hash (argon2 không có
    # giới hạn cứng như bcrypt's 72 bytes, nhưng vẫn nên giới hạn hợp lý)
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=30)


class UserLogin(BaseModel):
    """Body khi user đăng nhập."""
    email: EmailStr
    password: str


class ResendVerificationRequest(BaseModel):
    """Body khi user yêu cầu gửi lại email xác thực."""
    email: EmailStr


# ── OUTPUT (response) ─────────────────────────────────────────────────
class UserResponse(BaseModel):
    """Thông tin user trả về — KHÔNG có password."""
    id: str
    email: str
    username: str | None
    is_email_verified: bool
    is_active: bool

    class Config:
        from_attributes = True  # Cho phép tạo từ SQLAlchemy model


class MessageResponse(BaseModel):
    """Response chung khi chỉ cần báo message."""
    message: str


class VerificationStatusResponse(BaseModel):
    """Response cho polling trạng thái xác thực email."""
    verified: bool