"""
api/draft_router.py - Save, update, and resume draft jobs.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.jobs import SaveDraftRequest

router = APIRouter(tags=["Drafts"])
logger = logging.getLogger(__name__)


def _get_owned_draft(job_id: str, user: User, db: Session) -> Job:
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
            detail="Khong tim thay draft",
        )
    return job


def _draft_summary(job: Job) -> dict:
    return {
        "id": str(job.id),
        "status": job.status,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@router.post("/drafts", status_code=status.HTTP_201_CREATED)
def save_draft(
    data: SaveDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = Job(
        user_id=current_user.id,
        status="DRAFT",
        input_payload=json.dumps(data.model_dump(), ensure_ascii=False),
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info("Draft created | user=%s | job=%s", str(current_user.id)[:8], str(job.id)[:8])
    return _draft_summary(job)


@router.put("/drafts/{job_id}")
def update_draft(
    job_id: str,
    data: SaveDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_owned_draft(job_id, current_user, db)
    job.input_payload = json.dumps(data.model_dump(), ensure_ascii=False)

    db.commit()
    db.refresh(job)

    logger.info("Draft updated | user=%s | job=%s", str(current_user.id)[:8], str(job.id)[:8])
    return _draft_summary(job)


@router.get("/drafts/{job_id}", response_model=SaveDraftRequest)
def get_draft(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_owned_draft(job_id, current_user, db)
    try:
        return json.loads(job.input_payload)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Draft payload khong hop le",
        )
