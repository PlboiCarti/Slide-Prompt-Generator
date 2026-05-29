"""
models/job.py — Bảng jobs (async processing)
"""
import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from database.connection import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String(20), nullable=False, default="PENDING")
    input_payload = Column(Text, nullable=False)
    result_payload = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user = relationship("User", back_populates="jobs")

    @property
    def input_dict(self) -> dict:
        return json.loads(self.input_payload) if self.input_payload else {}

    @property
    def output_dict(self) -> dict:
        return json.loads(self.result_payload) if self.result_payload else {}

    @property
    def history_dict(self) -> dict:
        return {
            "job_id": str(self.id),
            "status": self.status,
            "input": self.input_dict,
            "result": self.output_dict if self.result_payload else None,
            "error_message": self.error_message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "deleted_at": self.deleted_at,
        }
