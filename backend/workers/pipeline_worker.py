"""
workers/pipeline_worker.py
Pipeline Phase 2 — sinh Master Prompt trong background thread (daemon).
KHÔNG dùng RQ/Redis — đơn giản hóa cho đồ án sinh viên.

Pipeline:
  B2: generate_slide_structure()  → list[SlideInstruction]
  B3: fill_slide_contents()       → list[SlideInstruction] + content
  B4: assemble_master_prompt()    → MasterPromptResult
"""
from __future__ import annotations

import json
import logging
import shutil
import time
from pathlib import Path
from datetime import datetime
from threading import Thread

from sqlalchemy.orm import Session

from database.connection import SessionLocal
from models.job import Job
from schemas.prompt import DesignDescription
from services.llm_service import (
    assemble_master_prompt,
    fill_slide_contents,
    generate_design_bundle,
    generate_slide_structure,
)

logger = logging.getLogger(__name__)

_JOB_TIMEOUT = 600  # 10 phút — job tự fail nếu chạy quá lâu


def run_pipeline_in_thread(job_id: str, payload: dict) -> Thread:
    """
    Chạy pipeline trong daemon thread.
    Trả về Thread object (caller có thể bỏ qua nếu không cần).
    Daemon thread tự tắt khi process chính tắt.
    """
    thread = Thread(
        target=_run_pipeline,
        args=(job_id, payload),
        daemon=True,
        name=f"pipeline-{job_id[:8]}",
    )
    thread.start()
    return thread


def _run_pipeline(job_id: str, payload: dict) -> None:
    """
    Thực thi pipeline Phase 2: cập nhật job status trong DB.
    Mọi exception đều được catch để job được mark FAILED.
    """
    purpose        = payload.get("purpose", "")
    audience       = payload.get("audience", "")
    style          = payload.get("style", "")
    primary_color  = payload.get("primary_color", "")
    slide_count    = payload.get("slide_count", 6)
    primary_layout = payload.get("primary_layout", "")
    language       = payload.get("language", "vi")
    raw_content    = payload.get("raw_content", "")
    description_dict = payload.get("description", {})  # từ Phase 1, user đã chỉnh
    file_paths     = payload.get("file_paths", [])

    # Mỗi thread mở session riêng — không share session từ request
    db: Session = SessionLocal()
    _start = time.monotonic()

    def _check_timeout() -> None:
        if time.monotonic() - _start > _JOB_TIMEOUT:
            raise TimeoutError(f"Job vượt quá giới hạn {_JOB_TIMEOUT}s")

    try:
        _update_job(db, job_id, "PROCESSING")
        logger.info(f"[{job_id[:8]}] PROCESSING | purpose='{purpose[:40]}'")

        from services.content_extractor import extract_content_from_files, normalize_extract_error
        # raw_content la text goc tu form; final_content la ket qua da gop text + file/OCR.
        if file_paths or raw_content.strip():
            try:
                final_content = extract_content_from_files(raw_content, file_paths)
            except Exception as e:
                logger.error(f"[{job_id[:8]}] Lỗi extract content: {e}")
                raise ValueError(normalize_extract_error(e)) from e
        else:
            final_content = ""

        # ── Chuẩn bị DesignDescription ────────────────────────────────
        # Ưu tiên description từ Phase 1 (đã user chỉnh sửa).
        # Nếu không có (gọi trực tiếp không qua Phase 1), tự sinh.
        if description_dict:
            design_description = DesignDescription(**description_dict)
            logger.info(f"[{job_id[:8]}] Using description from Phase 1")
        else:
            logger.info(f"[{job_id[:8]}] No description provided — generating automatically")
            _check_timeout()
            design_description = generate_design_bundle(
                purpose=purpose, audience=audience, style=style,
                layout=primary_layout, color=primary_color, language=language,
            )

        # ── B2: Sinh cấu trúc slide ───────────────────────────────────
        _check_timeout()
        logger.info(f"[{job_id[:8]}] B2: generating slide structure...")
        slides = generate_slide_structure(
            purpose=purpose,
            audience=audience,
            style=style,
            layout=primary_layout,
            slide_count=slide_count,
            language=language,
        )

        # ── B3: Ghép content vào từng slide ──────────────────────────
        _check_timeout()
        if final_content.strip():
            logger.info(f"[{job_id[:8]}] B3: filling slide contents...")
            slides = fill_slide_contents(
                slides=slides,
                content=final_content,
                language=language,
                design_description=design_description,
            )
        else:
            logger.info(f"[{job_id[:8]}] B3: no content provided — skipped")

        # ── B4: Assemble Master Prompt ────────────────────────────────
        result = assemble_master_prompt(
            purpose=purpose,
            audience=audience,
            style=style,
            primary_layout=primary_layout,
            design_description=design_description,
            slides=slides,
            language=language,
        )

        _update_job(db, job_id, "COMPLETED", result_payload=result.model_dump())
        logger.info(f"[{job_id[:8]}] COMPLETED — {result.total_slides} slides")

    except Exception as exc:
        logger.error(f"[{job_id[:8]}] FAILED: {exc}", exc_info=True)
        _update_job(db, job_id, "FAILED", error_message=str(exc))
    finally:
        if file_paths:
            try:
                upload_dir = Path(f"uploads/{job_id}")
                if upload_dir.exists():
                    shutil.rmtree(upload_dir)
            except Exception as e:
                logger.error(f"Lỗi xóa thư mục tạm {job_id}: {e}")
        db.close()


def _update_job(
    db: Session,
    job_id: str,
    status: str,
    result_payload: dict | None = None,
    error_message: str | None = None,
) -> None:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        logger.warning(f"[{job_id[:8]}] _update_job: job not found in DB — status '{status}' dropped")
        return
    job.status = status
    job.updated_at = datetime.utcnow()
    if result_payload is not None:
        job.result_payload = json.dumps(result_payload, ensure_ascii=False)
    if error_message is not None:
        job.error_message = error_message
    db.commit()
