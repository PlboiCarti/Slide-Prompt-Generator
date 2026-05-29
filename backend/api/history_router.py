import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.jobs import HistoryItemResponse

router = APIRouter(tags=["History"])
logger = logging.getLogger(__name__)

VISIBLE_STATUSES = {"COMPLETED", "FAILED", "DRAFT"}


def _extract_purpose(job: Job) -> str:
    try:
        payload = json.loads(job.input_payload or "{}")
    except (TypeError, json.JSONDecodeError):
        return ""
    return payload.get("purpose") or ""


def _to_history_item(job: Job) -> dict:
    return {
        "id": str(job.id),
        "status": job.status,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "purpose": _extract_purpose(job),
        "has_result": job.result_payload is not None,
        "error_message": job.error_message,
    }


def _to_bin_item(job: Job) -> dict:
    return {
        "id": str(job.id),
        "status": job.status,
        "purpose": _extract_purpose(job),
        "has_result": job.result_payload is not None,
        "error_message": job.error_message,
        "deleted_at": job.deleted_at,
        "created_at": job.created_at,
    }


def _get_owned_active_job(job_id: str, user: User, db: Session) -> Job:
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
            detail="Khong tim thay history item",
        )
    return job


def _get_owned_bin_job(job_id: str, user: User, db: Session) -> Job:
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
            detail="Khong tim thay trong thung rac",
        )
    return job


@router.get("/history", response_model=list[HistoryItemResponse])
def get_history(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.deleted_at.is_(None),
        Job.status.in_(VISIBLE_STATUSES),
    )

    if status_filter:
        normalized_status = status_filter.upper()
        if normalized_status not in VISIBLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status filter khong hop le",
            )
        query = query.filter(Job.status == normalized_status)

    jobs = query.order_by(Job.updated_at.desc()).all()
    return [_to_history_item(job) for job in jobs]


@router.delete("/history/{job_id}", status_code=status.HTTP_200_OK)
def soft_delete_history_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_owned_active_job(job_id, current_user, db)
    job.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(job)

    logger.info("Soft-deleted history job %s", str(job.id)[:8])
    return {"message": "Da dua job vao thung rac", "id": str(job.id)}


@router.get("/bin")
def get_bin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.deleted_at.isnot(None))
        .order_by(Job.deleted_at.desc())
        .all()
    )
    return [_to_bin_item(job) for job in jobs]


@router.post("/bin/{job_id}/restore")
def restore_bin_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_owned_bin_job(job_id, current_user, db)
    job.deleted_at = None
    db.commit()
    db.refresh(job)
    logger.info("Restored job %s from Bin", str(job.id)[:8])
    return _to_bin_item(job)


@router.delete("/bin/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_bin_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_owned_bin_job(job_id, current_user, db)
    db.delete(job)
    db.commit()
    logger.info("Hard-deleted job %s", str(job.id)[:8])


@router.delete("/bin", status_code=status.HTTP_204_NO_CONTENT)
def empty_bin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted_count = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.deleted_at.isnot(None))
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("Emptied bin for user %s | removed %d items", str(current_user.id)[:8], deleted_count)
