import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.jobs import HistoryItemResponse, JobStatus, SaveDraftRequest
from services.job_history_service import get_owned_draft, to_history_item

router = APIRouter(tags=["Drafts"])
logger = logging.getLogger(__name__)

# Biến SaveDraftRequest từ object Pydantic thành JSON string để lưu vào cột Job.input_payload
def _dump_draft_payload(data: SaveDraftRequest) -> str:
    return json.dumps(data.model_dump(), ensure_ascii=False) 

# Đọc JSON string từ DB rồi parse ngược lại thành dict để frontend đổ dữ liệu vào form draft.
def _load_draft_payload(raw: str) -> dict:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu bản nháp không hợp lệ."
        )
    return payload

@router.post("/drafts", response_model=HistoryItemResponse, status_code=status.HTTP_201_CREATED)
def save_draft(
    data: SaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Draft được lưu như một job để dùng chung danh sách history và luồng thùng rác.
    job = Job(
        user_id=current_user.id,
        status=JobStatus.DRAFT.value,
        input_payload=_dump_draft_payload(data)
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
    # get_owned_draft đảm bảo đúng chủ sở hữu và đúng status DRAFT trước khi sửa.
    job = get_owned_draft(job_id, current_user, db)
    job.input_payload = _dump_draft_payload(data)
    db.commit()
    db.refresh(job)
    return to_history_item(job)


@router.get("/drafts/{job_id}", response_model=SaveDraftRequest)
def get_draft(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Dữ liệu form đã lưu nằm trong input_payload; endpoint này bung lại về schema
    # draft form cho frontend.
    job = get_owned_draft(job_id, current_user, db)
    try:
        return _load_draft_payload(job.input_payload)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu bản nháp không hợp lệ.",
        )
