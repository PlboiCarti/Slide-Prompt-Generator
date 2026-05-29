"""
services/intent_detector.py — Dùng Gemini, không cần truyền client.
"""
from __future__ import annotations
import json, logging
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from services.intent_dictionary import (
    INTENT_DICT, get_all_options, get_category_description, get_instruction,
)
from utils.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_model():
    """Tạo model mới mỗi lần gọi — đảm bảo API key luôn được configure."""
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(settings.llm_model)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=5))
def detect_intents(user_preference: str) -> dict[str, str]:
    """
    Nhận chuỗi tự do → trả về dict intents đã validate.
    Ví dụ: "slide hiện đại cho nhà đầu tư"
         → {"style": "modern", "audience": "investor"}
    """
    if not user_preference or not user_preference.strip():
        return _default_intents()

    prompt = f"""Bạn là hệ thống phân loại intent cho ứng dụng tạo thuyết trình.

    Các category và ý nghĩa:
    {get_category_description()}

    Các giá trị hợp lệ:
    {json.dumps(get_all_options(), ensure_ascii=False, indent=2)}

    Quy tắc:
    1. Chỉ chọn intent nếu có dấu hiệu RÕ RÀNG trong input
    2. Mỗi category chỉ 1 giá trị
    3. Không bắt buộc đủ tất cả category — bỏ qua nếu không rõ
    4. Trả về JSON thuần, không markdown

    Schema: {{"purpose":"...","audience":"...","style":"...","layout":"...","complexity":"...","density":"...","tone":"..."}}"""

    model = _get_model()
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0,
            max_output_tokens=200,
            response_mime_type="application/json",
        ),
    )

    detected = _safe_parse(response.text)
    validated = _validate(detected)
    logger.info(f"Detected intents: {validated}")
    return validated


def build_instruction(intents: dict[str, str]) -> str:
    if not intents:
        return build_instruction(_default_intents())
    parts = []
    for cat in ["purpose", "audience", "style", "layout", "complexity", "density", "tone"]:
        kw = intents.get(cat)
        if kw:
            instr = get_instruction(cat, kw)
            if instr:
                parts.append(instr)
    return "\n".join(parts) if parts else build_instruction(_default_intents())


def detect_and_build(user_preference: str) -> tuple[dict, str]:
    """Gộp 2 bước — dùng trong pipeline_worker."""
    intents = detect_intents(user_preference)
    instruction = build_instruction(intents)
    return intents, instruction


def preview_intents(intents: dict[str, str]) -> str:
    labels = {
        "purpose": "Mục đích", "audience": "Khán giả",
        "style": "Phong cách", "layout": "Bố cục",
        "complexity": "Độ phức tạp",
        "density": "Mật độ",    "tone": "Giọng văn",
    }
    lines = []
    for cat, label in labels.items():
        kw = intents.get(cat)
        if kw:
            instr = get_instruction(cat, kw) or ""
            lines.append(f"✅ {label:<16} {kw:<14} → {instr[:50]}...")
        else:
            lines.append(f"⬜ {label:<16} (chưa xác định)")
    return "\n".join(lines)


def _validate(raw: dict) -> dict[str, str]:
    out = {}
    for cat, kw in raw.items():
        if cat not in INTENT_DICT:
            continue
        if kw not in INTENT_DICT[cat]:
            continue
        out[cat] = kw
    return out


def _default_intents() -> dict[str, str]:
    return {"style": "minimalist", "complexity": "intermediate", "tone": "neutral"}


def _safe_parse(raw: str) -> dict:
    try:
        return json.loads(
            raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        )
    except json.JSONDecodeError:
        return {}