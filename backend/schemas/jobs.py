"""
schemas/jobs.py — Pydantic schemas cho job processing
"""
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    DRAFT = "DRAFT"

class GenerateResponse(BaseModel):
    """Trả về ngay khi nhận yêu cầu tạo prompt."""
    job_id: str
    status: str = "PENDING"
    message: str = "Yêu cầu đã được tiếp nhận và đang xử lý."
    created_at: datetime


class JobStatusResponse(BaseModel):
    """Trả về khi poll trạng thái job."""
    job_id: str
    status: str
    result: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class HistoryItemResponse(BaseModel):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
    purpose: str | None = None
    audience: str | None = None
    has_result: bool = False
    error_message: str | None = None


class SaveDraftRequest(BaseModel):
    purpose: str
    audience: str
    style: str
    primary_color: str
    slide_count: int
    primary_layout: str
    content: str
    language: str
    description: dict[str, Any] | None = None
