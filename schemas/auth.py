"""
schemas/auth.py — Pydantic schemas cho auth
"""
from pydantic import BaseModel, EmailStr, Field


# ── INPUT (request body) ──────────────────────────────────────────────
class UserRegister(BaseModel):
    """Body khi user đăng ký bằng email/password."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # 72 là giới hạn bcrypt
    username: str | None = Field(default=None, min_length=3, max_length=30)


class UserLogin(BaseModel):
    """Body khi user đăng nhập."""
    email: EmailStr
    password: str


class EmailVerifyRequest(BaseModel):
    """Body để xác thực email từ token."""
    token: str


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


class TokenResponse(BaseModel):
    """Response sau khi đăng nhập thành công."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    """Response chung khi chỉ cần báo message."""
    message: str