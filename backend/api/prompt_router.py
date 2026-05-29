"""
api/prompt_router.py — HTTP endpoints cho prompt generation

Luồng 2 giai đoạn:
  Phase 1: POST /api/generate-description  → sync, trả về ngay (~3–5s)
  Phase 2: POST /api/generate              → async background job, client poll
"""
from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from utils.config import get_settings as _get_settings

_settings = _get_settings()
from models.job import Job
from models.user import User
from schemas.jobs import GenerateResponse, JobStatusResponse
from schemas.prompt import DescribeRequest, DesignDescription
from services.content_extractor import extract_content
from services.llm_service import generate_design_description
from utils.rate_limiter import generate_tracker
from workers.pipeline_worker import run_pipeline_in_thread

logger = logging.getLogger(__name__)
router = APIRouter()

# Tên hiển thị cho từng desc field để thông báo lỗi rõ ràng hơn
_DESC_FIELD_LABELS = {
    "tone":             "desc_tone (giọng điệu / tông văn bản)",
    "font":             "desc_font (kiểu chữ / font chữ)",
    "key_message_rule": "desc_key_message_rule (quy tắc thông điệp chính mỗi slide)",
    "density":          "desc_density (mật độ thông tin trên slide)",
    "visual":           "desc_visual (yếu tố hình ảnh / màu sắc minh hoạ)",
}


# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — Sinh mô tả thiết kế (synchronous)
# ══════════════════════════════════════════════════════════════════════

@router.post(
    "/generate-description",
    response_model=DesignDescription,
    tags=["Prompt Generation"],
    summary="Phase 1 — Phân tích & gợi ý thiết kế",
)
def generate_description(
    data: DescribeRequest,
    current_user: User = Depends(get_current_user),):
    """
    Nhận 6 trường form → gọi Gemini → trả về mô tả thiết kế (tone, font, ...).
    Synchronous — không tạo job, không cần poll.
    Frontend hiển thị kết quả cho user chỉnh sửa, rồi gửi sang Phase 2.
    """

    if generate_tracker.is_locked(current_user.id):
        retry_after = generate_tracker.time_until_unlock(current_user.id)
        minutes = max(1, round(retry_after / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Bạn đã gửi quá nhiều yêu cầu. "
                f"Vui lòng thử lại sau khoảng {minutes} phút."
            ),
            headers={"Retry-After": str(retry_after)},
        )
    generate_tracker.record_failed_attempt(current_user.id)
        
    logger.info(
        f"Phase1 generate-description | purpose='{data.purpose[:40]}' "
        f"| lang={data.language}"
    )
    result = generate_design_description(
        purpose=data.purpose,
        audience=data.audience,
        style=data.style,
        layout=data.primary_layout,
        color=data.primary_color,
        language=data.language,
    )
    logger.info("Phase1 complete")
    return result


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — Tạo Master Prompt (async background job)
# ══════════════════════════════════════════════════════════════════════

@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=GenerateResponse,
    tags=["Prompt Generation"],
    summary="Phase 2 — Tạo Master Prompt",
)
async def generate(
    # ── 6 trường form ─────────────────────────────────────────────────
    purpose: str       = Form(..., min_length=3, max_length=500),
    audience: str      = Form(..., min_length=3, max_length=200),
    style: str         = Form("minimalist"),
    primary_color: str = Form("#FF6B35"),
    slide_count: int   = Form(6, ge=_settings.min_slides_limit, le=_settings.max_slides_limit),
    primary_layout: str = Form("key_message"),
    language: str      = Form("vi"),
    # ── Content / PDF ─────────────────────────────────────────────────
    content: str       = Form("", max_length=100_000),
    pdf_file: UploadFile = File(None),
    # ── Description fields từ Phase 1 (5 field riêng lẻ) ─────────────
    # Tách thành field riêng để Swagger UI hiển thị rõ ràng, tránh lỗi
    # khi paste JSON string nhiều dòng vào form field.
    # Nếu để trống hết, pipeline tự gọi generate_design_description().
    desc_tone:             str = Form(""),
    desc_font:             str = Form(""),
    desc_key_message_rule: str = Form(""),
    desc_density:          str = Form(""),
    desc_visual:           str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tạo Master Prompt từ text và/hoặc PDF.
    Job chạy async trong background thread — client poll GET /api/jobs/{job_id}.

    **Gửi description (từ Phase 1):**
    Điền cả 5 field desc_* để dùng mô tả user đã chỉnh sửa.
    Để trống hết → pipeline tự sinh description trong background (user không xem/sửa được).
    """
    # Rate limit theo user
    if generate_tracker.is_locked(current_user.id):
        retry_after = generate_tracker.time_until_unlock(current_user.id)
        minutes = max(1, round(retry_after / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Bạn đã gửi quá nhiều yêu cầu. "
                f"Vui lòng thử lại sau khoảng {minutes} phút."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    # Phải có ít nhất 1 trong 2
    if not content.strip() and not pdf_file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải cung cấp ít nhất một trong hai: nội dung văn bản (content) hoặc file PDF.",
        )

    # Build description_dict từ 5 field riêng lẻ
    description_dict: dict = {}
    desc_fields = {
        "tone":             desc_tone.strip(),
        "font":             desc_font.strip(),
        "key_message_rule": desc_key_message_rule.strip(),
        "density":          desc_density.strip(),
        "visual":           desc_visual.strip(),
    }
    if any(desc_fields.values()):
        # User có ý định gửi description → báo lỗi ngay nếu thiếu field
        missing = [k for k, v in desc_fields.items() if not v]
        if missing:
            missing_labels = [_DESC_FIELD_LABELS.get(k, k) for k in missing]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Bạn đã điền một số trường mô tả thiết kế nhưng còn thiếu "
                    f"{len(missing)} trường sau: {', '.join(missing_labels)}. "
                    f"Vui lòng điền đầy đủ cả 5 trường hoặc để trống tất cả "
                    f"(để hệ thống tự sinh)."
                ),
            )
        description_dict = desc_fields

    # Ghi nhận attempt SAU KHI validate xong — tránh hao slot vì lỗi form
    generate_tracker.record_failed_attempt(current_user.id)

    # Gộp content từ text + PDF
    final_content = await extract_content(
        text_content=content or None,
        pdf_file=pdf_file,
    )

    payload = {
        "purpose":        purpose,
        "audience":       audience,
        "style":          style,
        "primary_color":  primary_color,
        "slide_count":    slide_count,
        "primary_layout": primary_layout,
        "language":       language,
        "content":        final_content,
        "description":    description_dict,  # dict (có thể rỗng)
    }

    job = Job(
        input_payload=json.dumps(payload, ensure_ascii=False),
        status="PENDING",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(
        f"Job created: {str(job.id)[:8]} | purpose='{purpose[:40]}' | "
        f"has_description={bool(description_dict)} | has_content={bool(final_content.strip())}"
    )

    # Chạy pipeline trong background thread (daemon)
    run_pipeline_in_thread(job_id=str(job.id), payload=payload)

    return GenerateResponse(
        job_id=str(job.id),
        status="PENDING",
        message="Yêu cầu đã được tiếp nhận. Đang sinh Master Prompt...",
        created_at=job.created_at or datetime.utcnow(),
    )


# ══════════════════════════════════════════════════════════════════════
# Poll trạng thái job
# ══════════════════════════════════════════════════════════════════════

@router.get(
    "/jobs/{job_id}",
    status_code=status.HTTP_200_OK,
    response_model=JobStatusResponse,
    tags=["Job Status"],
)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Poll trạng thái job. Frontend gọi mỗi 3s cho đến khi COMPLETED hoặc FAILED."""
    job = db.query(Job).filter(Job.id == job_id).first()

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
