"""
models/job.py — Bảng jobs (async processing)
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from database.connection import Base


class Job(Base):
    __tablename__ = "jobs"

    id             = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status         = Column(String(20), nullable=False, default="PENDING")
    input_payload  = Column(Text, nullable=False)
    result_payload = Column(Text, nullable=True)
    error_message  = Column(Text, nullable=True)
    deleted_at = Column(DateTime, nullable=True, default=None, index=True) # NULL = active, set = in bin
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Foreign key
    user_id        = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    user = relationship("User", back_populates="jobs")

