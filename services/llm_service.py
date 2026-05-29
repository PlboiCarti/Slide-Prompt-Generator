"""
services/llm_service.py — Sinh Master Prompt dùng Gemini
"""
from __future__ import annotations

import json
import logging
import re

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from schemas.prompt import MasterPromptResult, SlideInstruction
from utils.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _model():
    """Tạo model — configure API key mỗi lần để chắc chắn."""
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(settings.llm_model)


def _json_config(temp: float = 0.7, tokens: int = 4000):
    return genai.GenerationConfig(
        temperature=temp,
        max_output_tokens=tokens,
        response_mime_type="application/json",
    )


# ── Bước 4a: Sinh system_instruction + slide_instructions ────────────
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def generate_master_prompt_structure(
    system_instruction: str,
    language: str,
    slide_count: int,
) -> tuple[str, list[dict]]:
    """
    Sinh cấu trúc Master Prompt: (system_instruction_refined, slide_instructions)
    """
    lang_instr = (
        "Toàn bộ nội dung PHẢI bằng tiếng Việt."
        if language == "vi"
        else "All content MUST be in English."
    )

    prompt = f"""
<task>
    Bạn là hệ thống sinh Master Prompt chuyên nghiệp.
    Tạo Master Prompt để người dùng copy vào AI khác (ChatGPT, Claude, Gemini...).
    Khi AI nhận prompt này, nó phải tạo ra SLIDE POWERPOINT HOÀN CHỈNH.
</task>

<output_rules>
    - {lang_instr}
    - system_instruction phải:
        + Thể hiện đầy đủ yêu cầu của input sau:
          {system_instruction}
        + Không bỏ sót yêu cầu nào
        + Định nghĩa rõ vai trò của AI (chuyên gia tạo slide)
        + Yêu cầu AI tạo BỘ SLIDE POWERPOINT HOÀN CHỈNH
        + Quy định format output: Tiêu đề + bullet points + ghi chú diễn giả
        + Không dùng từ "gợi ý", "key points", "outline"
    - slide_instructions: ĐÚNG {slide_count} phần tử
    - Slide đầu: giới thiệu. Slide cuối: kết luận/CTA
    - instruction mỗi slide: chỉ thị cụ thể 1-2 câu
    - Trả về JSON hợp lệ, KHÔNG markdown code fence
</output_rules>

JSON Schema:
{{
    "master_prompt_title": "...",
    "system_instruction": "...",
    "slide_instructions": [
        {{"index": 1, "title": "...", "instruction": "..."}}
    ]
}}"""

    resp = _model().generate_content(
        prompt,
        generation_config=_json_config(temp=0.3, tokens=4000),
    )

    parsed = _safe_parse(resp.text)

    refined_instruction = parsed.get("system_instruction", "")
    slide_instructions = parsed.get("slide_instructions", [])

    if len(slide_instructions) < 3:
        raise ValueError(
            f"Gemini trả về {len(slide_instructions)} slides, cần ít nhất 3"
        )

    logger.info(f"Master prompt structure: {len(slide_instructions)} slides")
    return refined_instruction, slide_instructions


# ── Bước 4b: Chia content vào từng slide ──────────────────────────────
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
def split_content_to_slides(
    content: str,
    slide_titles: list[str],
    language: str,
) -> list[str]:
    """
    Chia content thành N đoạn tương ứng N slide.
    """
    if len(content) > 12_000:
        content = _recursive_summarize(content, language)

    n = len(slide_titles)
    if n > 10:
        mid = n // 2
        first = _split_batch(content, slide_titles[:mid], language, start_index=1)
        second = _split_batch(content, slide_titles[mid:], language, start_index=mid + 1)
        return first + second

    return _split_batch(content, slide_titles, language, start_index=1)


def _split_batch(
    content: str,
    slide_titles: list[str],
    language: str,
    start_index: int = 1,
) -> list[str]:
    n = len(slide_titles)
    lang_instr = "Trả lời bằng tiếng Việt." if language == "vi" else "Reply in English."
    titles_str = "\n".join(
        f"{start_index + i}. {t}" for i, t in enumerate(slide_titles)
    )

    prompt = f"""
<task>
    Phân chia nội dung tài liệu thành ĐÚNG {n} đoạn,
    mỗi đoạn tương ứng với 1 tiêu đề slide.
</task>

<slide_titles>
{titles_str}
</slide_titles>

<content>
{content}
</content>

<rules>
    - Mỗi đoạn 2-4 câu, bám sát nội dung tài liệu
    - Không bịa thêm thông tin
    - Nếu tài liệu không có thông tin cho slide → chuỗi rỗng ""
    - {lang_instr}
    - Trả về JSON, KHÔNG markdown code fence
    - PHẢI đủ ĐÚNG {n} phần tử trong mảng contents
</rules>

JSON: {{"contents": ["nội dung slide 1", "nội dung slide 2", ...]}}"""

    resp = _model().generate_content(
        prompt,
        generation_config=_json_config(temp=0.2, tokens=6000),
    )

    parsed = _safe_parse(resp.text)
    contents = parsed.get("contents", [])

    # Pad cho đủ độ dài
    while len(contents) < n:
        contents.append("")
    return contents[:n]


def _recursive_summarize(content: str, language: str, max_len: int = 12_000) -> str:
    """Tóm tắt content quá dài bằng cách chia chunk."""
    logger.info(f"Content {len(content)} ký tự — tóm tắt đệ quy")
    lang_instr = "Tóm tắt bằng tiếng Việt." if language == "vi" else "Summarize in English."
    chunks = [content[i:i + 4000] for i in range(0, len(content), 4000)]

    summaries: list[str] = []
    for i, chunk in enumerate(chunks):
        prompt = (
            f"Tóm tắt đoạn văn sau, giữ TẤT CẢ thông tin quan trọng "
            f"(số liệu, tên, sự kiện, luận điểm). Không bịa thêm. {lang_instr}\n\n{chunk}"
        )
        resp = _model().generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1, max_output_tokens=1000,
            ),
        )
        summaries.append(resp.text.strip())
        logger.info(f"Summarized chunk {i + 1}/{len(chunks)}")

    combined = "\n\n".join(summaries)
    if len(combined) > max_len:
        return _recursive_summarize(combined, language, max_len)
    return combined


# ── Bước 5: Assemble final MasterPromptResult ─────────────────────────
def assemble_master_prompt(
    system_instruction: str,
    slide_instructions: list[dict],
    slide_contents: list[str],
    language: str,
) -> MasterPromptResult:
    slides: list[SlideInstruction] = []
    for i, sp in enumerate(slide_instructions):
        content = slide_contents[i] if i < len(slide_contents) else ""
        slides.append(
            SlideInstruction(
                index=sp.get("index", i + 1),
                title=sp.get("title", f"Slide {i + 1}"),
                instruction=sp.get("instruction", ""),
                content=content or "",
            )
        )

    slides.sort(key=lambda s: s.index)
    full = _build_full_master_prompt(system_instruction, slides, language)

    return MasterPromptResult(
        master_prompt_title="Master Prompt - Presentation",
        system_instruction=system_instruction,
        slide_instructions=slides,
        total_slides=len(slides),
        full_master_prompt=full,
    )


def _build_full_master_prompt(
    system_instruction: str,
    slides: list[SlideInstruction],
    language: str = "vi",
) -> str:
    """Ghép thành chuỗi hoàn chỉnh để user copy vào AI khác."""
    if language == "vi":
        action = (
            f"Dựa trên nội dung dưới đây, hãy thiết kế một **BỘ SLIDE THUYẾT TRÌNH "
            f"CHUYÊN NGHIỆP** gồm {len(slides)} slide. "
            f"Mục tiêu là **trực quan hóa thông tin**, đảm bảo mỗi slide sẵn sàng "
            f"để trình diễn với câu chữ ngắn gọn, cô đọng và có tính tác động cao."
        )
        format_rules = (
            f"File PowerPoint (.pptx) hoặc Google Slides link chứa {len(slides)} slide đầy đủ\n"
            f"Mỗi slide tuân thủ 100% yêu cầu nội dung + thiết kế dưới đây\n"
            f"Không là Markdown, không là text — là slide thực tế có thể trình bày\n"
            f"Số lượng bullet: tối thiểu 3, tối đa 5 bullet/slide\n\n"

            f"Với MỖI slide, hãy trả về theo cấu trúc:\n"
            f"\n## Slide [Số thứ tự] — [Tiêu đề Slide]\n"
            f"**Mục tiêu Slide:** [bám theo TITLE]\n"
            f"**Chữ trên slide (On-Slide Text):**\n"
            f"• [Ý chính 1 — tối đa 15 từ]\n"
            f"• [Ý chính 2 — tối đa 15 từ]\n"
            f"• [Ý chính 3 — tối đa 15 từ]\n"
            f"**Yếu tố hình ảnh:** [Gợi ý icon, biểu đồ, hình ảnh]\n"
            f"**Ghi chú diễn giả:** [1-2 câu kịch bản]"
        )
        note = (
            "NỘI DUNG trên slide phải dựa trên thông tin thực tế từ tài liệu gốc. "
            "Tuyệt đối không bịa đặt số liệu hay thông tin mới."
        )
    else:
        action = (
            f"Based on the content below, design a PROFESSIONAL PRESENTATION DECK "
            f"of {len(slides)} slides."
        )
        format_rules = (
            f"PowerPoint file (.pptx) or Google Slides link with {len(slides)} slides.\n"
            f"Each slide must comply 100% with the content + design rules.\n"
            f"Minimum 3, maximum 5 bullets per slide.\n\n"

            f"For EACH slide:\n"
            f"\n## Slide [number] — [Title]\n"
            f"**Main Content:**\n"
            f"• [Bullet 1 — max 15 words]\n"
            f"• [Bullet 2 — max 15 words]\n"
            f"• [Bullet 3 — max 15 words]\n"
            f"\n**Speaker Notes:** [1-2 sentences]"
        )
        note = (
            "Use factual information from the source document. "
            "Do not fabricate data."
        )

    lines = [
        "[NHIỆM VỤ CỦA BẠN]" if language == "vi" else "[YOUR TASK]",
        action,
        "",
        "[VAI TRÒ]" if language == "vi" else "[YOUR ROLE]",
        system_instruction,
        "",
        "[LƯU Ý]" if language == "vi" else "[NOTE]",
        note,
        "",
        "[YÊU CẦU FORMAT OUTPUT]" if language == "vi" else "[OUTPUT FORMAT]",
        format_rules,
        "",
        "=" * 60,
        "[NỘI DUNG TỪNG SLIDE]" if language == "vi" else "[SLIDE CONTENT]",
        "=" * 60,
        "",
    ]

    for slide in slides:
        lines.append(f"## Slide {slide.index} — {slide.title}")
        lines.append(f"INSTRUCTION: {slide.instruction}")
        if slide.content and slide.content.strip():
            lines.append(f"CONTENT: {slide.content}")
        else:
            no_content = (
                "CONTENT: (Không có tài liệu — hãy tạo nội dung phù hợp dựa trên tiêu đề và instruction)"
                if language == "vi"
                else "CONTENT: (No source material — create appropriate content based on title and instruction)"
            )
            lines.append(no_content)
        lines.append("")

    lines.append("=" * 60)
    if language == "vi":
        lines.append("Bây giờ hãy bắt đầu tạo Slide PowerPoint cho tất cả slide theo format trên.")
    else:
        lines.append("Now please create PowerPoint slides for all items above.")

    return "\n".join(lines)


# ── Helper ─────────────────────────────────────────────────────────────
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _safe_parse(raw: str) -> dict:
    """
    Parse JSON từ Gemini, tự xử lý code fence ```json...```.
    Trả về dict rỗng nếu parse fail.
    """
    if not raw:
        return {}

    cleaned = raw.strip()
    # Bỏ code fence ở đầu và cuối (an toàn hơn lstrip vốn chỉ theo charset)
    cleaned = _CODE_FENCE_RE.sub("", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e} | raw[:300]: {raw[:300]}")
        return {}