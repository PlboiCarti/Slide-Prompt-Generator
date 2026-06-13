from datetime import datetime
from typing import Any

from pydantic import BaseModel

from schemas.jobs import JobStatus


class HistoryItemResponse(BaseModel):
    """Short item shown in history and for restored bin records."""
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    purpose: str | None = None
    audience: str | None = None
    has_result: bool = False
    error_message: str | None = None


class PaginatedHistoryResponse(BaseModel):
    """Paginated response for /history."""
    items: list[HistoryItemResponse]
    total: int
    limit: int
    offset: int


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
