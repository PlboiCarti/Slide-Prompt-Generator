"""
database/connection.py — SQLAlchemy engine + session
Tự detect SQLite vs Postgres để cấu hình phù hợp.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from utils.config import get_settings

settings = get_settings()

database_url = settings.SQLALCHEMY_DATABASE_URL

# SQLite cần connect_args khác Postgres
if database_url.startswith("sqlite"):
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},  # cho phép dùng từ nhiều thread
        echo=settings.is_development,
    )
else:
    # Postgres / MySQL: dùng pooling mặc định của SQLAlchemy
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.is_development,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yield DB session, đóng khi xong."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Tạo tất cả bảng. Gọi 1 lần khi app khởi động."""
    # Import models để Base biết các bảng cần tạo
    from models import job, user, auth_provider  # noqa: F401
    Base.metadata.create_all(bind=engine)