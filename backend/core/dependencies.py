"""
core/dependencies.py — FastAPI dependencies
Đọc token từ Authorization header HOẶC HttpOnly cookie.
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from core.security import decode_token
from database.connection import get_db
from models.user import User


# auto_error=False để tự fallback sang cookie nếu không có header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Bảo vệ route — chỉ cho phép user đã đăng nhập.
    Đọc token từ:
    1. Authorization header (Bearer <token>)
    2. HttpOnly cookie (access_token)

    Dùng: `def my_route(user: User = Depends(get_current_user))`
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Header trước, cookie sau
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise credentials_exception

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa",
        )

    return user


def get_current_verified_user(
    user: User = Depends(get_current_user),
) -> User:
    """Strict hơn: chỉ cho phép user đã verify email."""
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vui lòng xác thực email trước",
        )
    return user