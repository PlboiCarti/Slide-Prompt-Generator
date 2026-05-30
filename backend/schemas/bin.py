from datetime import datetime

from pydantic import BaseModel

from schemas.jobs import JobStatus


class BinItemResponse(BaseModel):
    """Bản ghi rút gọn hiển thị cho item history đã xóa mềm."""
    id: str
    status: JobStatus
    purpose: str | None = None
    audience: str | None = None
    has_result: bool = False
    error_message: str | None = None
    deleted_at: datetime
    created_at: datetime
