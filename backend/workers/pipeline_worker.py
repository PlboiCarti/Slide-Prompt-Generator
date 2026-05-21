"""
workers/pipeline_worker.py
Pipeline sinh Master Prompt — chạy trong background thread (daemon).
KHÔNG dùng RQ/Redis — đồ án sinh viên đơn giản hóa.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from threading import Thread

from sqlalchemy.orm import Session

from database.connection import SessionLocal
from models.job import Job
from services.llm_service import (
    assemble_master_prompt,
    generate_master_prompt_structure,
    split_content_to_slides,
)

logger = logging.getLogger(__name__)


def run_pipeline_in_thread(job_id: str, payload: dict) -> Thread:
    """
    Chạy pipeline trong daemon thread.
    Trả về Thread object (caller có thể bỏ qua nếu không cần).

    Daemon thread sẽ tự tắt khi process chính tắt.
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
    Thực thi pipeline: cập nhật job status trong DB.
    Mọi exception đều được catch để job được mark FAILED.
    """
    purpose = payload.get("purpose", "")
    audience = payload.get("audience", "")
    style = payload.get("style", "")
    primary_color = payload.get("primary_color", "")
    slide_count = payload.get("slide_count", 6)
    primary_layout = payload.get("primary_layout", "")
    language = payload.get("language", "vi")
    content = payload.get("content", "")

    # Mỗi thread mở session riêng — không share session từ request
    db: Session = SessionLocal()

    try:
        _update_job(db, job_id, "PROCESSING")
        logger.info(f"[{job_id[:8]}] PROCESSING | purpose='{purpose[:40]}'")

        # Bước 1: Build instruction từ payload
        system_instruction = _build_instruction_from_payload(
            purpose=purpose,
            audience=audience,
            style=style,
            color=primary_color,
            slide_count=slide_count,
            layout=primary_layout,
            language=language,
        )
        logger.info(f"[{job_id[:8]}] Step 1: instruction built")

        # Bước 2: Sinh cấu trúc Master Prompt
        logger.info(f"[{job_id[:8]}] Step 2: generating structure...")
        refined_instruction, slide_instructions = generate_master_prompt_structure(
            system_instruction=system_instruction,
            language=language,
            slide_count=slide_count,
        )

        # Bước 3: Chia content vào từng slide
        slide_titles = [s.get("title", "") for s in slide_instructions]
        if content.strip():
            logger.info(f"[{job_id[:8]}] Step 3: splitting content...")
            slide_contents = split_content_to_slides(
                content=content,
                slide_titles=slide_titles,
                language=language,
            )
        else:
            slide_contents = [""] * len(slide_instructions)
            logger.info(f"[{job_id[:8]}] Step 3: no content provided")

        # Bước 4: Assemble
        result = assemble_master_prompt(
            system_instruction=refined_instruction,
            slide_instructions=slide_instructions,
            slide_contents=slide_contents,
            language=language,
        )

        _update_job(db, job_id, "COMPLETED", result_payload=result.model_dump())
        logger.info(f"[{job_id[:8]}] COMPLETED — {result.total_slides} slides")

    except Exception as exc:
        logger.error(f"[{job_id[:8]}] FAILED: {exc}", exc_info=True)
        _update_job(db, job_id, "FAILED", error_message=str(exc))
    finally:
        db.close()


def _build_instruction_from_payload(
    purpose: str,
    audience: str,
    style: str,
    color: str,
    slide_count: int,
    layout: str,
    language: str,
) -> str:
    """Build instruction string từ form input."""
    if language == "vi":
        lines = [
            f"Mục đích: {purpose}",
            f"Đối tượng người xem: {audience}",
            f"Phong cách thiết kế: {style}",
            f"Màu sắc chủ đạo: {color}",
            f"Số lượng slide: {slide_count}",
            f"Bố cục chính: {layout}",
            f"Ngôn ngữ: {language}",
        ]
    else:
        lines = [
            f"Purpose: {purpose}",
            f"Target audience: {audience}",
            f"Design style: {style}",
            f"Primary color: {color}",
            f"Number of slides: {slide_count}",
            f"Primary layout: {layout}",
            f"Language: {language}",
        ]
    return "\n".join(lines)


def _update_job(
    db: Session,
    job_id: str,
    status: str,
    result_payload: dict | None = None,
    error_message: str | None = None,
) -> None:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return
    job.status = status
    job.updated_at = datetime.utcnow()
    if result_payload is not None:
        job.result_payload = json.dumps(result_payload, ensure_ascii=False)
    if error_message is not None:
        job.error_message = error_message
    db.commit()