import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.job import Job
from models.user import User
from schemas.bin import BinItemResponse
from schemas.jobs import HistoryItemResponse, JobStatus

HISTORY_VISIBLE_STATUSES = (
    JobStatus.COMPLETED.value,
    JobStatus.FAILED.value,
    JobStatus.DRAFT.value,
)


def _extract_input_payload(job: Job) -> dict:
    # Card history/bin chỉ cần vài field từ input_payload. Payload lỗi hoặc
    # không phải object không nên làm hỏng API danh sách.
    try:
        payload = json.loads(job.input_payload or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def to_history_item(job: Job) -> HistoryItemResponse:
    # Gom logic tạo response vào một chỗ để router không lặp việc parse payload
    # và không trả trực tiếp field thô từ Job ORM.
    payload = _extract_input_payload(job)
    return HistoryItemResponse(
        id=str(job.id),
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        purpose=payload.get("purpose") or "",
        audience=payload.get("audience") or "",
        has_result=job.result_payload is not None,
        error_message=job.error_message,
    )


def to_bin_item(job: Job) -> BinItemResponse:
    # Item trong thùng rác bắt buộc phải đã xóa mềm; job active thuộc /history.
    if job.deleted_at is None:
        raise ValueError("Bin item must have deleted_at")

    payload = _extract_input_payload(job)
    return BinItemResponse(
        id=str(job.id),
        status=job.status,
        purpose=payload.get("purpose") or "",
        audience=payload.get("audience") or "",
        has_result=job.result_payload is not None,
        error_message=job.error_message,
        deleted_at=job.deleted_at,
        created_at=job.created_at,
    )


def get_owned_active_job(job_id: str, user: User, db: Session) -> Job:
    # Tập trung kiểm tra quyền sở hữu và trạng thái active cho các thao tác history.
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.user_id == user.id,
            Job.deleted_at.is_(None),
        )
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy mục lịch sử.",
        )
    return job


def get_owned_bin_job(job_id: str, user: User, db: Session) -> Job:
    # Thao tác thùng rác không được vượt qua ranh giới user hoặc ảnh hưởng job active.
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.user_id == user.id,
            Job.deleted_at.isnot(None),
        )
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy mục trong thùng rác.",
        )
    return job


def get_owned_draft(job_id: str, user: User, db: Session) -> Job:
    # Draft endpoint chỉ được đọc/sửa draft active thuộc user đang gọi.
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.user_id == user.id,
            Job.status == JobStatus.DRAFT.value,
            Job.deleted_at.is_(None),
        )
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bản nháp.",
        )
    return job
