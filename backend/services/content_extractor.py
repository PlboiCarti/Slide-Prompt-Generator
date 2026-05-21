"""
services/content_extractor.py
Nhận text và/hoặc file PDF → trả về 1 chuỗi content duy nhất.
"""
from __future__ import annotations

import io
import logging

from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

MAX_PDF_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_CONTENT_LENGTH = 100_000      # 100k ký tự


async def extract_content(
    text_content: str | None,
    pdf_file: UploadFile | None,
) -> str:
    """
    Xử lý 1 trong 2 hoặc cả 2 nguồn input.

    Trường hợp:
    - Chỉ text → trả về text
    - Chỉ PDF  → extract PDF → trả về
    - Cả hai   → gộp lại, text trước, PDF sau
    """
    parts: list[str] = []

    if text_content and text_content.strip():
        if len(text_content) > MAX_CONTENT_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Text content quá dài (max {MAX_CONTENT_LENGTH} ký tự)",
            )
        parts.append(text_content.strip())
        logger.info(f"Text input: {len(text_content)} ký tự")

    if pdf_file:
        await _validate_pdf_file(pdf_file)
        pdf_text = await _extract_pdf(pdf_file)
        if pdf_text.strip():
            parts.append(pdf_text.strip())
            logger.info(f"PDF input: {len(pdf_text)} ký tự từ '{pdf_file.filename}'")
        else:
            logger.warning(f"PDF '{pdf_file.filename}' không trích xuất được text")

    if not parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không có nội dung — cần text hoặc PDF",
        )

    combined = "\n\n---\n\n".join(parts)
    logger.info(f"Tổng content sau gộp: {len(combined)} ký tự")
    return combined


async def _validate_pdf_file(pdf_file: UploadFile) -> None:
    """Validate PDF trước khi extract."""
    if pdf_file.size and pdf_file.size > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File PDF quá lớn ({pdf_file.size} bytes, max {MAX_PDF_SIZE} bytes)",
        )

    if pdf_file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ chấp nhận file PDF (MIME type: {pdf_file.content_type})",
        )


async def _extract_pdf(pdf_file: UploadFile) -> str:
    """Đọc bytes từ UploadFile, trích xuất text bằng pypdf."""
    import pypdf  # local import — chỉ load khi cần

    raw_bytes = await pdf_file.read()
    reader = pypdf.PdfReader(io.BytesIO(raw_bytes))

    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text.strip())

    return "\n\n".join(pages)