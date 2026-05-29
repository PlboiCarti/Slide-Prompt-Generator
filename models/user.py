"""
models/user.py — Bảng users
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.orm import relationship

from database.connection import Base


class User(Base):
    __tablename__ = "users"

    # UUID làm primary key — khó đoán hơn auto-increment int
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)

    is_email_verified = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # ── Email verification (thay vì lưu Redis) ────────────────────────
    # Token để verify email — NULL khi đã verify hoặc chưa gửi
    email_verification_token = Column(String, nullable=True, index=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # 1 user có thể có nhiều phương thức đăng nhập (LOCAL, GOOGLE, ...)
    auth_providers = relationship(
        "AuthProvider",
        back_populates="user",
        cascade="all, delete-orphan",
    )