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
    """Response returned immediately after accepting a generation request."""
    job_id: str
    status: JobStatus = JobStatus.PENDING
    message: str = "Yêu cầu đã được tiếp nhận và đang xử lý."
    created_at: datetime


class JobStatusResponse(BaseModel):
    """Response for polling job status."""
    job_id: str
    status: JobStatus
    result: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
