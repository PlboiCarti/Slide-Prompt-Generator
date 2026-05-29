"""
api/prompt_router.py — HTTP endpoints cho prompt generation
"""
from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from models.job import Job
from models.user import User
from schemas.jobs import GenerateResponse, JobStatusResponse, DescriptionGenerateRequest
from services.content_extractor import extract_content
from workers.pipeline_worker import run_pipeline_in_thread
from services.description_service import generate_description_from_options
from core.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()




@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=GenerateResponse,
    tags=["Prompt Generation"],
)
async def generate(
    purpose: str = Form(..., min_length=3, max_length=500),
    audience: str = Form(..., min_length=3, max_length=200),
    style: str = Form("minimalist"),
    primary_color: str = Form("#FF6B35"),
    slide_count: int = Form(6, ge=3, le=30),
    primary_layout: str = Form("key_message"),
    content: str = Form("", max_length=100_000),
    language: str = Form("vi"),
    pdf_file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Tạo Master Prompt từ text và/hoặc PDF.
    Job chạy async trong background thread.
    """
    # Phải có ít nhất 1 trong 2
    if not content.strip() and not pdf_file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải cung cấp content hoặc pdf_file",
        )

    # Gộp content từ text + PDF
    final_content = await extract_content(
        text_content=content or None,
        pdf_file=pdf_file,
    )

    payload = {
        "purpose": purpose,
        "audience": audience,
        "style": style,
        "primary_color": primary_color,
        "slide_count": slide_count,
        "primary_layout": primary_layout,
        "language": language,
        "content": final_content,
    }

    job = Job(
        input_payload=json.dumps(payload, ensure_ascii=False),
        status="PENDING",
        user_id=current_user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(f"Job created: {str(job.id)[:8]} | purpose='{purpose[:40]}'")

    # Chạy pipeline trong background thread (daemon)
    run_pipeline_in_thread(job_id=str(job.id), payload=payload)

    return GenerateResponse(
        job_id=str(job.id),
        status="PENDING",
        message="Yêu cầu đã được tiếp nhận. Đang sinh Master Prompt...",
        created_at=job.created_at or datetime.utcnow(),
    )
@router.post(
    "/description/generate",
    status_code=status.HTTP_200_OK,
    tags=["Description"],
)
def test_generate_description(data: DescriptionGenerateRequest):
    try:
        result = generate_description_from_options(
            purpose=data.purpose,
            audience=data.audience,
            style=data.style,
            primary_layout=data.primary_layout,
            slide_count=data.slide_count,
            language=data.language,
        )

        return {
            "description": result.get("description"),
            "description_detail": result,
        }

    except Exception as e:
        logger.exception("Lỗi khi sinh description")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
@router.get(
    "/jobs/{job_id}",
    status_code=status.HTTP_200_OK,
    response_model=JobStatusResponse,
    tags=["Job Status"],
)
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll trạng thái job."""
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.user_id == current_user.id,
            Job.deleted_at.is_(None),
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy job: {job_id}",
        )

    result = None
    if job.status == "COMPLETED" and job.result_payload:
        result = json.loads(job.result_payload)

    return JobStatusResponse(
        job_id=str(job.id),
        status=job.status,
        result=result,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )
