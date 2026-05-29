"""
models/auth_provider.py
1 User có nhiều AuthProvider (local + google + ...).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum as SQLEnum,ForeignKey
from sqlalchemy.orm import relationship

from database.connection import Base


class ProviderType(str, enum.Enum):
    """Các phương thứ   c đăng nhập được hỗ trợ."""
    LOCAL = "local"      # email + password
    GOOGLE = "google"    # Google OAuth


class AuthProvider(Base):
    __tablename__ = "auth_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    provider = Column(SQLEnum(ProviderType), nullable=False)

    # ID từ provider bên ngoài (google_sub, ...). NULL nếu là LOCAL.
    provider_user_id = Column(String, nullable=True, index=True)

    # Password hash — CHỈ có nếu provider = LOCAL.
    password_hash = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="auth_providers")