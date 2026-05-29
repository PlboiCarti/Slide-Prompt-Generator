"""
api/bin_router.py - Trash bin for soft-deleted jobs.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status,Query
from sqlalchemy.orm import Session
from datetime import datetime

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.bin import BinItemResponse

router = APIRouter(tags=["Bin"])
logger = logging.getLogger(__name__)


def _extract_purpose(job: Job) -> str:
    try:
        payload = json.loads(job.input_payload or "{}")
    except (TypeError, json.JSONDecodeError):
        return ""
    return payload.get("purpose") or ""


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
@router.delete("/me/history/{job_id}", status_code=status.HTTP_200_OK,tags="history")
def delete_my_history_item(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = (
        db.query(Job)
        .filter(Job.id == job_id, Job.user_id == current_user.id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Khong tim thay job: {job_id}",
        )

    if job.deleted_at is None:
        job.deleted_at = datetime.utcnow()
        db.commit()
        db.refresh(job)

    return {
        "message": "Da dua job vao thung rac",
        "job": job.history_dict,
    }


@router.get("/me/trash",tags="history")
def get_my_trash(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.deleted_at.is_not(None))
        .order_by(Job.deleted_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [job.history_dict for job in jobs]

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


@router.get("/bin", response_model=list[BinItemResponse])
def get_bin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all soft-deleted jobs for the current user."""
    jobs = (
        db.query(Job)
        .filter(
            Job.user_id == current_user.id,
            Job.deleted_at.isnot(None),
        )
        .order_by(Job.deleted_at.desc())
        .all()
    )
    return [_to_bin_item(job) for job in jobs]


@router.post("/bin/{job_id}/restore", response_model=BinItemResponse)
def restore_bin_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore one job from Bin back to History."""
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
    """Permanently delete one job from the database."""
    job = _get_owned_bin_job(job_id, current_user, db)
    db.delete(job)
    db.commit()
    logger.info("Hard-deleted job %s", str(job.id)[:8])


@router.delete("/bin", status_code=status.HTTP_204_NO_CONTENT)
def empty_bin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete all Bin items owned by the current user."""
    deleted_count = (
        db.query(Job)
        .filter(
            Job.user_id == current_user.id,
            Job.deleted_at.isnot(None),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info(
        "Emptied bin for user %s | removed %d items",
        str(current_user.id)[:8],
        deleted_count,
    )
