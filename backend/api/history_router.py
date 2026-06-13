import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.bin import PaginatedBinResponse
from schemas.history import HistoryItemResponse, PaginatedHistoryResponse
from services.job_history_service import (
    HISTORY_VISIBLE_STATUSES,
    get_owned_active_job,
    get_owned_bin_job,
    to_bin_item,
    to_history_item,
)

router = APIRouter(tags=["History"])
logger = logging.getLogger(__name__)


@router.get("/history", response_model=PaginatedHistoryResponse)
def get_history(
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # History chỉ hiện các job còn active, thuộc user hiện tại và có status phù hợp
    # với danh sách người dùng thấy. Job đang chạy sẽ được theo dõi qua API poll.
    query = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.deleted_at.is_(None),
        Job.status.in_(HISTORY_VISIBLE_STATUSES),
    )

    if status_filter:
        # Chuẩn hóa status từ query string để chấp nhận cả draft và DRAFT.
        normalized_status = status_filter.upper()
        if normalized_status not in HISTORY_VISIBLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trạng thái lọc không hợp lệ.",
            )
        query = query.filter(Job.status == normalized_status)

    total = query.count()
    jobs = query.order_by(Job.updated_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [to_history_item(job) for job in jobs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/history/{job_id}", status_code=status.HTTP_200_OK)
def soft_delete_history_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Xóa mềm giữ lại job và result_payload để có thể khôi phục từ /bin.
    job = get_owned_active_job(job_id, current_user, db)
    job.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(job)

    logger.info("Soft-deleted history job %s", str(job.id)[:8])
    return {"message": "Đã chuyển mục vào thùng rác.", "id": str(job.id)}


@router.get("/bin", response_model=PaginatedBinResponse)
def get_bin(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Thùng rác chỉ gồm các item đã xóa mềm và thuộc user hiện tại.
    query = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.deleted_at.isnot(None),
    )
    total = query.count()
    jobs = query.order_by(Job.deleted_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [to_bin_item(job) for job in jobs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/bin/{job_id}/restore", response_model=HistoryItemResponse)
def restore_bin_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Khôi phục chỉ cần xóa deleted_at; status gốc của job được giữ nguyên.
    job = get_owned_bin_job(job_id, current_user, db)
    job.deleted_at = None
    db.commit()
    db.refresh(job)
    logger.info("Restored job %s from Bin", str(job.id)[:8])
    return to_history_item(job)


@router.delete("/bin/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_bin_item(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Xóa vĩnh viễn chỉ áp dụng cho item đã nằm trong thùng rác của user hiện tại.
    job = get_owned_bin_job(job_id, current_user, db)
    db.delete(job)
    db.commit()
    logger.info("Hard-deleted job %s", str(job.id)[:8])


@router.delete("/bin", status_code=status.HTTP_204_NO_CONTENT)
def empty_bin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Xóa hàng loạt được giới hạn theo user_id và deleted_at để không đụng vào history active.
    deleted_count = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.deleted_at.isnot(None))
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("Emptied bin for user %s | removed %d items", str(current_user.id)[:8], deleted_count)
