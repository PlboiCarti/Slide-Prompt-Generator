"""
services/content_extractor.py
Nhận text và/hoặc file PDF → trả về 1 chuỗi content duy nhất.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_CONTENT_LENGTH = 100_000      # 100k ký tự


def extract_content_from_files(
    text_content: str | None,
    file_paths: list[str],
) -> str:
    """
    Xử lý text input và danh sách file (PDF, hình ảnh).
    """
    parts: list[str] = []

    if text_content and text_content.strip():
        if len(text_content) > MAX_CONTENT_LENGTH:
            raise ValueError(f"Text content quá dài (max {MAX_CONTENT_LENGTH} ký tự)")
        parts.append(text_content.strip())
        logger.info(f"Text input: {len(text_content)} ký tự")

    for file_path in file_paths:
        file_size = os.path.getsize(file_path)
        if file_size > MAX_FILE_SIZE:
            logger.warning(f"File {file_path} quá lớn ({file_size} bytes, max {MAX_FILE_SIZE}).")
            continue

        ext = os.path.splitext(file_path)[1].lower()
        if ext in (".pdf", ".x-pdf"):
            logger.info(f"Processing PDF: {file_path}")
            pdf_text = _extract_pdf(file_path)
            if not pdf_text.strip() or len(pdf_text.strip()) < 50:
                logger.info(f"PDF '{file_path}' không trích xuất được text hoặc quá ngắn, thử dùng Tesseract OCR...")
                pdf_text = _tesseract_extract(file_path, is_pdf=True)
            if pdf_text.strip():
                parts.append(pdf_text.strip())
                logger.info(f"PDF input: {len(pdf_text)} ký tự từ '{file_path}'")
        elif ext in (".png", ".jpg", ".jpeg", ".webp"):
            logger.info(f"Processing Image: {file_path}")
            img_text = _tesseract_extract(file_path, is_pdf=False)
            if img_text.strip():
                parts.append(img_text.strip())
                logger.info(f"Image input: {len(img_text)} ký tự từ '{file_path}'")
        else:
            logger.warning(f"Bỏ qua định dạng file không hỗ trợ: {ext}")

    if not parts:
        raise ValueError("Không có nội dung — vui lòng cung cấp text hoặc file hợp lệ.")

    combined = "\n\n---\n\n".join(parts)
    logger.info(f"Tổng content sau gộp: {len(combined)} ký tự")
    return combined


def _extract_pdf(file_path: str) -> str:
    """Đọc text từ file PDF bằng pypdf."""
    import pypdf

    try:
        reader = pypdf.PdfReader(file_path)
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                pages.append(text.strip())
        return "\n\n".join(pages)
    except Exception as e:
        logger.error(f"Lỗi đọc PDF bằng pypdf {file_path}: {e}")
        return ""


def _tesseract_extract(file_path: str, is_pdf: bool = False) -> str:
    """Đọc text từ file ảnh hoặc PDF scan bằng Tesseract OCR (Local)."""
    import pytesseract
    from PIL import Image
    import sys
    
    # CHÚ Ý TRÊN WINDOWS: Cần trỏ đúng tới nơi bạn đã cài Tesseract
    if sys.platform == "win32":
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

    try:
        if is_pdf:
            from pdf2image import convert_from_path
            # Yêu cầu phải có Poppler trên OS để chạy convert_from_path.
            if sys.platform == "win32" and os.path.exists(r'C:\poppler\bin'):
                images = convert_from_path(file_path, poppler_path=r'C:\poppler\bin')
            else:
                images = convert_from_path(file_path)
                
            text_parts = []
            for img in images:
                text = pytesseract.image_to_string(img, lang='vie')
                if text.strip():
                    text_parts.append(text.strip())
            return "\n\n".join(text_parts)
        else:
            img = Image.open(file_path)
            text = pytesseract.image_to_string(img, lang='vie')
            return text.strip()
    except Exception as e:
        logger.error(f"Lỗi khi chạy Tesseract OCR cho {file_path}: {e}")
        return ""