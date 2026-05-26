"""
services/auth_service.py — Business logic cho authentication.
Không dùng Redis: email verify token lưu vào DB (cột trong bảng users).
"""
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from core.security import (
    create_access_token,
    generate_email_verification_token,
    hash_password,
    verify_password,
)
from models.auth_provider import AuthProvider, ProviderType
from models.user import User
from schemas.auth import UserRegister
from services.email_service import send_verification_email
from utils.config import get_settings
from utils.rate_limiter import login_tracker

logger = logging.getLogger(__name__)
settings = get_settings()


class AuthService:
    """Đóng gói toàn bộ logic xác thực."""

    def __init__(self, db: Session):
        self.db = db

    # ── ĐĂNG KÝ EMAIL/PASSWORD ────────────────────────────────────────
    def register_with_email(self, data: UserRegister) -> User:
        """
        Flow: Check email exists → Create user → Hash password → Save → Issue verify token
        """
        # Bước 1: Email đã tồn tại?
        existing = self.db.query(User).filter(User.email == data.email).first()
        if existing:
            logger.warning(f"Register attempt with existing email: {data.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email đã được đăng ký",
            )

        # Bước 2: Tạo user mới
        verify_token = generate_email_verification_token()
        expires_at = datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFY_TTL_HOURS)

        user = User(
            email=data.email,
            username=data.username,
            is_email_verified=False,
            is_active=True,
            email_verification_token=verify_token,
            email_verification_expires_at=expires_at,
        )
        self.db.add(user)
        self.db.flush()  # lấy user.id

        # Bước 3: Tạo AuthProvider local với password hash
        auth_provider = AuthProvider(
            user_id=user.id,
            provider=ProviderType.LOCAL,
            password_hash=hash_password(data.password),
        )
        self.db.add(auth_provider)
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"User registered: {user.email} (id={str(user.id)[:8]})")

        # Bước 4: Gửi email verify
        verify_url = f"http://localhost:8000/api/auth/verify-email?token={verify_token}"
        sent = send_verification_email(user.email, verify_url)
        if not sent:
            # SMTP chưa config hoặc fail → log ra thay vì print
            logger.info(f"[DEV] Verify link cho {user.email}: {verify_url}")

        return user

    def verify_email(self, token: str) -> User:
        """Xác thực email từ token trong URL."""
        user = (
            self.db.query(User)
            .filter(User.email_verification_token == token)
            .first()
        )

        if not user:
            logger.warning(f"Email verification failed: invalid token (token={token[:12]}...)")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token không hợp lệ",
            )

        # Check hết hạn
        if (
            user.email_verification_expires_at is None
            or user.email_verification_expires_at < datetime.utcnow()
        ):
            logger.warning(f"Email verification failed: token expired for {user.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu gửi lại.",
            )

        # OK — verify và xóa token (1 token chỉ dùng được 1 lần)
        user.is_email_verified = True
        user.email_verification_token = None
        user.email_verification_expires_at = None
        self.db.commit()

        logger.info(f"Email verified: {user.email} (id={str(user.id)[:8]})")
        return user

    # ── ĐĂNG NHẬP EMAIL/PASSWORD ──────────────────────────────────────
    def login_with_email(self, email: str, password: str) -> tuple[User, str]:
        """
        Flow: Rate limit → Verify password → Check verified → Issue token
        """
        # Bước 1: Rate limit
        if login_tracker.is_locked(email):
            logger.warning(f"Login blocked (rate limit): {email}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Tài khoản bị khóa tạm thời do nhiều lần đăng nhập sai. "
                    f"Vui lòng thử lại sau {settings.LOCKOUT_MINUTES} phút."
                ),
            )

        # Bước 2: Tìm user + AuthProvider local
        user = self.db.query(User).filter(User.email == email).first()
        auth_provider = None
        if user:
            auth_provider = (
                self.db.query(AuthProvider)
                .filter(
                    AuthProvider.user_id == user.id,
                    AuthProvider.provider == ProviderType.LOCAL,
                )
                .first()
            )

        # Bước 3: Verify password
        # QUAN TRỌNG: Cùng 1 thông báo dù email sai hay password sai (chống enumeration)
        if (
            not user
            or not auth_provider
            or not auth_provider.password_hash
            or not verify_password(password, auth_provider.password_hash)
        ):
            login_tracker.record_failed_attempt(email)
            attempts = login_tracker.get_attempts(email)
            logger.warning(
                f"Login failed (wrong credentials): {email} "
                f"(attempt {attempts}/{settings.MAX_LOGIN_ATTEMPTS})"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email hoặc mật khẩu không đúng",
            )

        # Bước 4: Email đã verify chưa?
        if not user.is_email_verified:
            logger.warning(f"Login denied (unverified email): {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vui lòng xác thực email trước khi đăng nhập",
            )

        # Bước 5: Reset counter + issue token
        login_tracker.reset(email)
        access_token = create_access_token(user.id)
        logger.info(f"Login success: {email} (id={str(user.id)[:8]})")
        return user, access_token

    # ── GOOGLE OAUTH ──────────────────────────────────────────────────
    def login_or_register_with_google(
        self,
        google_id: str,
        email: str,
        verified_by_google: bool = True,
    ) -> tuple[User, str, str]:
        """
        Xử lý sau khi Google trả về thông tin user.
        Return: (user, access_token, login_status)

        login_status:
        - "existing_google": Đã có account Google này → login thẳng
        - "new_user": Tạo account mới hoàn toàn
        """
        # Bước 1: Tìm AuthProvider Google
        google_provider = (
            self.db.query(AuthProvider)
            .filter(
                AuthProvider.provider == ProviderType.GOOGLE,
                AuthProvider.provider_user_id == google_id,
            )
            .first()
        )

        if google_provider:
            # Đã từng login Google rồi → login thẳng
            user = google_provider.user
            access_token = create_access_token(user.id)
            logger.info(f"Google login (existing): {email} (id={str(user.id)[:8]})")
            return user, access_token, "existing_google"

        # Bước 2: Email đã được đăng ký bằng cách khác chưa?
        existing_user = self.db.query(User).filter(User.email == email).first()

        if existing_user:
            # Email tồn tại nhưng chưa có Google provider.
            # KHÔNG auto-link để phòng account takeover.
            logger.warning(
                f"Google login blocked: {email} already registered via LOCAL "
                f"(google_id={google_id[:12]}...)"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Email này đã được đăng ký bằng password. "
                    "Vui lòng đăng nhập bằng password trước."
                ),
            )

        # Bước 3: User hoàn toàn mới → tạo account
        new_user = User(
            email=email,
            is_email_verified=verified_by_google,  # tin Google đã verify email
            is_active=True,
        )
        self.db.add(new_user)
        self.db.flush()

        new_provider = AuthProvider(
            user_id=new_user.id,
            provider=ProviderType.GOOGLE,
            provider_user_id=google_id,
            password_hash=None,
        )
        self.db.add(new_provider)
        self.db.commit()
        self.db.refresh(new_user)

        access_token = create_access_token(new_user.id)
        logger.info(f"Google login (new user registered): {email} (id={str(new_user.id)[:8]})")
        return new_user, access_token, "new_user"