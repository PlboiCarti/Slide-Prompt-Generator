import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.jobs import HistoryItemResponse, SaveDraftRequest
from services.job_history_service import get_owned_draft, to_history_item

router = APIRouter(tags=["Drafts"])
logger = logging.getLogger(__name__)


@router.post("/drafts", response_model=HistoryItemResponse, status_code=status.HTTP_201_CREATED)
def save_draft(
    data: SaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = Job(
        user_id=current_user.id,
        status="DRAFT",
        input_payload=json.dumps(data.model_dump(), ensure_ascii=False),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    logger.info("Draft created | user=%s | purpose=%.40s", str(current_user.id)[:8], data.purpose)
    return to_history_item(job)


@router.put("/drafts/{job_id}", response_model=HistoryItemResponse)
def update_draft(
    job_id: str,
    data: SaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = get_owned_draft(job_id, current_user, db)
    job.input_payload = json.dumps(data.model_dump(), ensure_ascii=False)
    db.commit()
    db.refresh(job)
    return to_history_item(job)


@router.get("/drafts/{job_id}", response_model=SaveDraftRequest)
def get_draft(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = get_owned_draft(job_id, current_user, db)
    try:
        return json.loads(job.input_payload)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu bản nháp không hợp lệ.",
        )
