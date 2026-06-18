"""
api/prompt_router.py — HTTP endpoints cho prompt generation

Luồng 2 giai đoạn:
  Phase 1: POST /api/generate-description  → sync, trả về ngay (~3–5s)
  Phase 2: POST /api/generate              → async background job, client poll
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from core.dependencies import get_current_user
from database.connection import get_db
from utils.config import get_settings as _get_settings

_settings = _get_settings()
from models.job import Job
from models.user import User
from schemas.jobs import GenerateResponse, JobStatusResponse
from schemas.prompt import ColorPalette, DescribeRequest, DesignDescription
from services.content_extractor import MAX_FILE_SIZE
from services.llm_service import generate_design_bundle, generate_design_bundle_async
from utils.rate_limiter import generate_tracker
from workers.pipeline_worker import run_pipeline_in_thread

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_FILE_SIGNATURES = {
    ".pdf": {
        "label": "PDF",
        "mime_types": {"application/pdf", "application/x-pdf"},
    },
    ".png": {
        "label": "PNG",
        "mime_types": {"image/png"},
    },
    ".jpg": {
        "label": "JPEG",
        "mime_types": {"image/jpeg", "image/jpg"},
    },
    ".jpeg": {
        "label": "JPEG",
        "mime_types": {"image/jpeg", "image/jpg"},
    },
    ".webp": {
        "label": "WEBP",
        "mime_types": {"image/webp"},
    },
}
_UNSUPPORTED_FILE_DETAIL = (
    "File không đúng định dạng cho phép. "
    "Vui lòng tải lên PDF, PNG, JPG hoặc WEBP."
)
_FILE_TOO_LARGE_DETAIL = (
    f"File vượt quá giới hạn dung lượng cho phép. "
    f"Vui lòng tải lên file nhỏ hơn {MAX_FILE_SIZE // 1024 // 1024}MB."
)


def _detect_file_type(header: bytes) -> str | None:
    if header.startswith(b"%PDF-"):
        return ".pdf"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ".webp"
    return None


def _same_upload_type(expected_ext: str, detected_ext: str) -> bool:
    if expected_ext in {".jpg", ".jpeg"} and detected_ext == ".jpg":
        return True
    return expected_ext == detected_ext


async def _validate_upload_file(upload: UploadFile) -> str:
    original_name = Path(upload.filename or "").name
    ext = Path(original_name).suffix.lower()

    if not original_name:
        logger.warning("Upload rejected: missing filename")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_UNSUPPORTED_FILE_DETAIL,
        )

    allowed = _ALLOWED_FILE_SIGNATURES.get(ext)
    if not allowed:
        logger.warning("Upload rejected: unsupported extension filename=%s ext=%s", original_name, ext)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=_UNSUPPORTED_FILE_DETAIL,
        )

    upload.file.seek(0, os.SEEK_END)
    file_size = upload.file.tell()
    await upload.seek(0)
    if file_size > MAX_FILE_SIZE:
        logger.warning(
            "Upload rejected: file too large filename=%s size=%s max_size=%s",
            original_name,
            file_size,
            MAX_FILE_SIZE,
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=_FILE_TOO_LARGE_DETAIL,
        )

    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type != "application/octet-stream":
        if content_type not in allowed["mime_types"]:
            logger.warning(
                "Upload rejected: invalid MIME filename=%s ext=%s content_type=%s expected=%s",
                original_name,
                ext,
                content_type,
                sorted(allowed["mime_types"]),
            )
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=_UNSUPPORTED_FILE_DETAIL,
            )

    header = await upload.read(16)
    await upload.seek(0)
    detected_ext = _detect_file_type(header)
    if not detected_ext:
        logger.warning(
            "Upload rejected: unknown signature filename=%s ext=%s content_type=%s header=%r",
            original_name,
            ext,
            content_type,
            header,
        )
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=_UNSUPPORTED_FILE_DETAIL,
        )
    if not _same_upload_type(ext, detected_ext):
        logger.warning(
            "Upload rejected: extension/signature mismatch filename=%s ext=%s detected_ext=%s content_type=%s",
            original_name,
            ext,
            detected_ext,
            content_type,
        )
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=_UNSUPPORTED_FILE_DETAIL,
        )

    return ext

# Tên hiển thị cho từng desc field để thông báo lỗi rõ ràng hơn
_DESC_FIELD_LABELS = {
    "tone":             "desc_tone (giọng điệu / tông văn bản)",
    "font":             "desc_font (kiểu chữ / font chữ)",
    "key_message_rule": "desc_key_message_rule (quy tắc thông điệp chính mỗi slide)",
    "density":          "desc_density (mật độ thông tin trên slide)",
    "visual":           "desc_visual (bố cục minh hoạ / visual hierarchy)",
    "color_palette":    "desc_color_palette (bảng màu)",
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
async def generate_description(
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
    generate_tracker.record_attempt(current_user.id)
        
    logger.info(
        f"Phase1 generate-description | purpose='{data.purpose[:40]}' "
        f"| lang={data.language}"
    )
    try:
        result = await generate_design_bundle_async(
            purpose=data.purpose, audience=data.audience, style=data.style,
            layout=data.primary_layout, color=data.primary_color, language=data.language,
        )
    except Exception as e:
        logger.error(f"Phase1 generate_design_bundle failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ AI tạm thời không phản hồi. Vui lòng thử lại sau ít phút.",
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
    files: list[UploadFile] | None = File(None),
    # ── Description fields từ Phase 1 (5 field riêng lẻ) ─────────────
    # Tách thành field riêng để Swagger UI hiển thị rõ ràng, tránh lỗi
    # khi paste JSON string nhiều dòng vào form field.
    # Nếu để trống hết, pipeline tự gọi generate_design_description().
    desc_tone:             str = Form(""),
    desc_font:             str = Form(""),
    desc_key_message_rule: str = Form(""),
    desc_density:          str = Form(""),
    desc_visual:           str = Form(""),
    desc_color_palette:    str = Form(""),  # JSON-encoded ColorPalette
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

    valid_files = []
    if files:
        valid_files = [f for f in files if f.filename]
    has_valid_files = len(valid_files) > 0

    # Phải có ít nhất 1 trong 2
    if not content.strip() and not has_valid_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải cung cấp ít nhất một trong hai: nội dung văn bản (content) hoặc tải lên file.",
        )

    # Build description_dict từ 5 field riêng lẻ
    validated_files: list[tuple[UploadFile, str]] = []
    if has_valid_files:
        for upload in valid_files:
            ext = await _validate_upload_file(upload)
            validated_files.append((upload, ext))

    description_dict: dict = {}
    desc_fields = {
        "tone":             desc_tone.strip(),
        "font":             desc_font.strip(),
        "key_message_rule": desc_key_message_rule.strip(),
        "density":          desc_density.strip(),
        "visual":           desc_visual.strip(),
        "color_palette":    desc_color_palette.strip(),
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
                    f"Vui lòng điền đầy đủ cả 6 trường hoặc để trống tất cả "
                    f"(để hệ thống tự sinh)."
                ),
            )
        description_dict = desc_fields

        # Validate & chuẩn hoá desc_color_palette (JSON-encoded ColorPalette)
        try:
            palette_raw = json.loads(description_dict["color_palette"])
            palette_obj = ColorPalette(**palette_raw)
        except (json.JSONDecodeError, TypeError, ValidationError) as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{_DESC_FIELD_LABELS['color_palette']} không hợp lệ: "
                    f"dữ liệu JSON bảng màu không đúng định dạng ({e})."
                ),
            )
        description_dict["color_palette"] = palette_obj.model_dump()

    # Ghi nhận attempt SAU KHI validate xong — tránh hao slot vì lỗi form
    generate_tracker.record_attempt(current_user.id)

    # Khởi tạo Job trước để lấy ID (tạm thời để input_payload rỗng hoặc cơ bản)
    job = Job(
        user_id=current_user.id,
        input_payload="{}", # Sẽ cập nhật sau
        status="PENDING",
    )
    db.add(job)
    db.flush() # Dùng flush() thay vì commit() để lấy ID mà chưa chốt transaction

    job_id = str(job.id)
    file_paths = []


    temp_dir: Path | None = None
    if has_valid_files:
        temp_dir = Path(f"uploads/tmp/{uuid4().hex}")
        temp_dir.mkdir(parents=True, exist_ok=True)
        final_dir = Path(f"uploads/{job_id}")
        for f, ext in validated_files:
            filename = f"{uuid4().hex}{ext}"
            with open(temp_dir / filename, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            file_paths.append(str(final_dir / filename))

    # Worker se tao final_content bang cach gop raw_content voi noi dung doc tu file_paths.
    payload = {
        "purpose":        purpose,
        "audience":       audience,
        "style":          style,
        "primary_color":  primary_color,
        "slide_count":    slide_count,
        "primary_layout": primary_layout,
        "language":       language,
        "raw_content":    content,
        "file_paths":     file_paths,
        "description":    description_dict,  # dict (có thể rỗng)
    }

    # Cập nhật lại job và commit
    job.input_payload = json.dumps(payload, ensure_ascii=False)
    db.commit()
    db.refresh(job)

    # Di chuyển files từ temp → final SAU KHI commit thành công
    if temp_dir is not None:
        try:
            temp_dir.rename(Path(f"uploads/{job_id}"))
        except Exception as e:
            logger.error("Không thể move temp dir sang final location: %s", e)
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    logger.info(
        f"Job created: {job_id[:8]} | purpose='{purpose[:40]}' | "
        f"has_description={bool(description_dict)} | files={len(file_paths)}"
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
def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll trạng thái job. Frontend gọi mỗi 3s cho đến khi COMPLETED hoặc FAILED."""
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
