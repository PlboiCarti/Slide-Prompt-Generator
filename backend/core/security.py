"""
core/security.py — Hash password và JWT
"""
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from utils.config import get_settings

settings = get_settings()

# pwdlib tự pick argon2 nếu có extra [argon2]
pwd_context = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash password trước khi lưu DB."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """So sánh password user nhập với hash trong DB."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str, expires_minutes: int | None = None) -> str:
    """
    Tạo JWT access token.
    Token chứa user_id, được ký bằng JWT_SECRET_KEY.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Giải mã JWT, kiểm tra chữ ký và thời hạn. None nếu invalid."""
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except InvalidTokenError:
        return None


def generate_email_verification_token() -> str:
    """Tạo token ngẫu nhiên (cryptographically secure) cho email verification."""
    return secrets.token_urlsafe(32)