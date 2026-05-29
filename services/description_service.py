import json
import re
import google.generativeai as genai
from fastapi import HTTPException, status

from utils.config import get_settings

settings = get_settings()


_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _safe_parse_json(raw: str) -> dict:
    if not raw:
        return {}

    cleaned = raw.strip()

    # Bỏ markdown code fence nếu Gemini trả về ```json ... ```
    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    # Nếu Gemini trả thêm chữ ngoài JSON thì chỉ lấy phần từ { đến }
    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start:end + 1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "LLM trả về nội dung không parse được JSON",
                "error": str(e),
                "raw_response": raw,
                "cleaned_response": cleaned,
            },
        )


def _model():
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(settings.llm_model)

def generate_description_from_options(
    purpose: str,
    audience: str,
    style: str,
    primary_layout: str,
    slide_count: int,
    language: str = "vi",
) -> dict:
    """
    Sinh trường mô tả tự động từ lựa chọn của người dùng.
    Người dùng không nhập mô tả.
    """

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chưa cấu hình GEMINI API KEY",
        )

    lang_rule = (
        "Toàn bộ kết quả phải bằng tiếng Việt."
        if language == "vi"
        else "All output must be in English."
    )

    prompt = f"""
Bạn là bộ phân tích yêu cầu tạo slide thuyết trình.

Nhiệm vụ:
Từ các lựa chọn của người dùng, hãy sinh ra một trường "description"
dùng để mô tả ngữ cảnh, giọng văn, quy chuẩn trình bày, font, bố cục,
mức độ trang trọng và các quy định ngầm cần áp dụng khi tạo slide.

Thông tin người dùng đã chọn:
- Mục đích: {purpose}
- Đối tượng: {audience}
- Phong cách thiết kế: {style}
- Bố cục chính: {primary_layout}
- Số lượng slide: {slide_count}
- Ngôn ngữ: {language}

Yêu cầu:
- {lang_rule}
- Không hỏi lại người dùng.
- Không đưa ra nhiều phương án.
- Không viết quá dài.
- Description phải đủ rõ để đưa vào prompt sinh slide.
- Phải suy luận các quy định ngầm phù hợp với mục đích và đối tượng.
- Trả về JSON hợp lệ, không markdown code fence.

JSON schema:
{{
  "description": "...",
  "tone": "...",
  "font_style": "...",
  "visual_style": "...",
  "layout_rule": "...",
  "hidden_rules": ["...", "...", "..."]
}}
"""
    response = _model().generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )

    parsed = _safe_parse_json(response.text)

    if not parsed or not parsed.get("description"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không sinh được mô tả từ LLM",
        )

    return parsed