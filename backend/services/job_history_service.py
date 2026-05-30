import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.job import Job
from models.user import User
from schemas.bin import BinItemResponse
from schemas.jobs import HistoryItemResponse

VISIBLE_STATUSES = {"COMPLETED", "FAILED", "DRAFT"}


def _extract_input_payload(job: Job) -> dict:
    try:
        payload = json.loads(job.input_payload or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def to_history_item(job: Job) -> HistoryItemResponse:
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
            detail="History item not found",
        )
    return job


def get_owned_bin_job(job_id: str, user: User, db: Session) -> Job:
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
            detail="Bin item not found",
        )
    return job


def get_owned_draft(job_id: str, user: User, db: Session) -> Job:
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.user_id == user.id,
            Job.status == "DRAFT",
            Job.deleted_at.is_(None),
        )
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    return job
