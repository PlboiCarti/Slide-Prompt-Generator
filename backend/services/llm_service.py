"""
services/llm_service.py — Sinh Master Prompt dùng Gemini

Pipeline 2 giai đoạn:
  Phase 1 (sync)  : generate_design_description()  → DesignDescription
  Phase 2 (async) : generate_slide_structure()      → list[SlideInstruction]
                    fill_slide_contents()            → list[SlideInstruction] + content
                    assemble_master_prompt()         → MasterPromptResult
"""
from __future__ import annotations

import json
import logging
import re
import time
from contextlib import contextmanager

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from schemas.prompt import DesignDescription, MasterPromptResult, SlideInstruction
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


@contextmanager
def _timed(label: str):
    """Context manager log thời gian thực thi của một Gemini call."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - t0
        logger.info(f"{label} | took {elapsed:.2f}s")


# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — generate_design_description
# Synchronous, gọi trực tiếp từ HTTP handler (~3–5s)
# ══════════════════════════════════════════════════════════════════════

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def generate_design_description(
    purpose: str,
    audience: str,
    style: str,
    layout: str,
    color: str,
    language: str,
) -> DesignDescription:
    """
    Phase 1 — Sinh mô tả thiết kế từ form input.
    Trả về DesignDescription (5 field) để frontend hiển thị cho user chỉnh sửa.
    """
    lang_instr = (
        "Toàn bộ nội dung PHẢI bằng tiếng Việt."
        if language == "vi"
        else "All content MUST be in English."
    )

    prompt = f"""
<task>
    Bạn là chuyên gia thiết kế slide thuyết trình chuyên nghiệp.
    Phân tích các thông số sau và sinh mô tả thiết kế chi tiết, cụ thể.
</task>

<input>
    Mục đích: {purpose}
    Đối tượng người xem: {audience}
    Phong cách thiết kế: {style}
    Bố cục chính: {layout}
    Màu sắc chủ đạo: {color}
    Ngôn ngữ: {language}
</input>

<rules>
    - {lang_instr}
    - tone: Giọng điệu và cảm xúc phù hợp với mục đích + đối tượng (1–2 câu ngắn gọn)
    - font: Đúng 1 tên font chữ duy nhất — KHÔNG dùng "hoặc", không giải thích
    - key_message_rule: Cách trình bày ý chính trên slide (ngắn, súc tích, in đậm, v.v.)
    - density: Mật độ nội dung — số bullet tối đa, tỉ lệ chữ/hình, v.v.
    - visual: Hướng dẫn visual hierarchy, cách phối màu, không gian bố cục
    - Trả về JSON hợp lệ, KHÔNG markdown code fence
    - QUAN TRỌNG: 
        + Trả về JSON hợp lệ tuyệt đối
        + Mỗi value phải là string 1 dòng duy nhất
        + KHÔNG xuống dòng trong bất kỳ value nào
        + Mỗi value tối đa 30 từ
</rules>

JSON Schema:
{{
  "tone":             "...",
  "font":             "...",
  "key_message_rule": "...",
  "density":          "...",
  "visual":           "..."
}}"""

    with _timed("Phase1 generate_design_description"):
        resp = _model().generate_content(
            prompt,
            generation_config=_json_config(temp=0.3, tokens=2000),
        )

    parsed = _safe_parse(resp.text)
    logger.info("Design description generated")

    return DesignDescription(
        tone=parsed.get("tone", ""),
        font=parsed.get("font", ""),
        key_message_rule=parsed.get("key_message_rule", ""),
        density=parsed.get("density", ""),
        visual=parsed.get("visual", ""),
    )


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — B2: generate_slide_structure
# ══════════════════════════════════════════════════════════════════════

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def generate_slide_structure(
    purpose: str,
    audience: str,
    style: str,
    layout: str,
    slide_count: int,
    language: str,
) -> list[SlideInstruction]:
    """
    Phase 2, bước B2 — Sinh cấu trúc N slide (title + instruction).
    Trả về list[SlideInstruction] đã validate — không để list[dict] thô chạy qua pipeline.
    """
    if slide_count < 3:
        raise ValueError(f"slide_count phải >= 3 (hiện tại: {slide_count})")

    lang_instr = (
        "Toàn bộ nội dung PHẢI bằng tiếng Việt."
        if language == "vi"
        else "All content MUST be in English."
    )

    prompt = f"""
<task>
    Sinh cấu trúc bộ slide thuyết trình gồm đúng {slide_count} slide.
</task>

<input>
    Mục đích: {purpose}
    Đối tượng người xem: {audience}
    Phong cách thiết kế: {style}
    Bố cục chính: {layout}
</input>

<rules>
    - {lang_instr}
    - Slide đầu tiên: giới thiệu / mở đầu
    - Slide cuối cùng: kết luận / call-to-action
    - instruction mỗi slide: chỉ thị cụ thể 1–2 câu, đủ để AI hiểu cần tạo gì
    - Phải có đúng {slide_count} phần tử trong mảng slide_instructions
    - Trả về JSON hợp lệ, KHÔNG markdown code fence
</rules>

JSON Schema:
{{
  "slide_instructions": [
    {{"index": 1, "title": "...", "instruction": "..."}}
  ]
}}"""

    with _timed(f"B2 generate_slide_structure ({slide_count} slides)"):
        resp = _model().generate_content(
            prompt,
            generation_config=_json_config(temp=0.3, tokens=3000),
        )

    parsed = _safe_parse(resp.text)
    raw_slides = parsed.get("slide_instructions", [])

    # Validate ngay tại đây — không để dict thô chạy xuyên pipeline
    slides: list[SlideInstruction] = []
    for i, item in enumerate(raw_slides):
        slides.append(
            SlideInstruction(
                index=item.get("index", i + 1),
                title=item.get("title", f"Slide {i + 1}"),
                instruction=item.get("instruction", ""),
                content="",
            )
        )

    slides.sort(key=lambda s: s.index)
    logger.info(f"B2 slide structure: {len(slides)}/{slide_count} slides returned")
    return slides


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — B3: fill_slide_contents
# ══════════════════════════════════════════════════════════════════════

def fill_slide_contents(
    slides: list[SlideInstruction],
    content: str,
    language: str,
) -> list[SlideInstruction]:
    """
    Phase 2, bước B3 — Ghép content từ tài liệu vào từng slide.
    - Có content → bám sát tài liệu, chia đều vào từng slide
    - Không có  → trả lại slides không thay đổi (content = "")
    """
    if not content.strip():
        return slides

    # Tóm tắt nếu quá dài
    if len(content) > 12_000:
        content = _recursive_summarize(content, language)

    slide_titles = [s.title for s in slides]
    n = len(slide_titles)

    # Chia batch nếu > 10 slides để tránh prompt quá dài
    try:
        if n > 10:
            mid = n // 2
            first_contents = _split_batch(content, slide_titles[:mid], language, start_index=1)
            second_contents = _split_batch(content, slide_titles[mid:], language, start_index=mid + 1)
            all_contents = first_contents + second_contents
        else:
            all_contents = _split_batch(content, slide_titles, language, start_index=1)
    except Exception:
        # Sau 3 lần retry vẫn lỗi → fallback về content rỗng, không crash job
        logger.warning("B3 _split_batch thất bại sau retry — tiếp tục với content rỗng")
        all_contents = [""] * n

    # Trả về list[SlideInstruction] mới với content đã điền
    result: list[SlideInstruction] = []
    for i, slide in enumerate(slides):
        filled_content = all_contents[i] if i < len(all_contents) else ""
        result.append(
            SlideInstruction(
                index=slide.index,
                title=slide.title,
                instruction=slide.instruction,
                content=filled_content,
            )
        )
    return result


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def _split_batch(
    content: str,
    slide_titles: list[str],
    language: str,
    start_index: int = 1,
) -> list[str]:
    n = len(slide_titles)
    
    lang_instr = (
        "Toàn bộ nội dung PHẢI bằng tiếng Việt."
        if language == "vi"
        else "All content MUST be in English."
    )

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
    - Mỗi đoạn 2–4 câu, bám sát nội dung tài liệu
    - Không bịa thêm thông tin
    - Nếu tài liệu không có thông tin cho slide → chuỗi rỗng ""
    - {lang_instr}
    - Trả về JSON, KHÔNG markdown code fence
    - PHẢI đủ ĐÚNG {n} phần tử trong mảng contents
</rules>

JSON: {{"contents": ["nội dung slide 1", "nội dung slide 2", ...]}}"""

    with _timed(f"B3 _split_batch ({n} slides, start={start_index})"):
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
        with _timed(f"  summarize chunk {i + 1}/{len(chunks)}"):
            resp = _model().generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1, max_output_tokens=1000,
                ),
            )
        summaries.append(resp.text.strip())
        logger.info(f"  chunk {i + 1}/{len(chunks)} summarized: {len(chunk)} → {len(resp.text.strip())} ký tự")

    combined = "\n\n".join(summaries)
    if len(combined) > max_len:
        return _recursive_summarize(combined, language, max_len)
    return combined


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — B4: assemble_master_prompt
# ══════════════════════════════════════════════════════════════════════

def assemble_master_prompt(
    purpose: str,
    audience: str,
    style: str,
    primary_color: str,
    primary_layout: str,
    design_description: DesignDescription,
    slides: list[SlideInstruction],
    language: str,
) -> MasterPromptResult:
    """
    Phase 2, bước B4 — Ghép thành MasterPromptResult hoàn chỉnh.
    Input nhận DesignDescription đã được user chỉnh sửa (Phase 1).
    """
    slides_sorted = sorted(slides, key=lambda s: s.index)
    full = _build_full_master_prompt(
        purpose=purpose,
        audience=audience,
        style=style,
        primary_color=primary_color,
        primary_layout=primary_layout,
        design_description=design_description,
        slides=slides_sorted,
        language=language,
    )

    return MasterPromptResult(
        master_prompt_title="Master Prompt - Presentation",
        design_description=design_description,
        slide_instructions=slides_sorted,
        total_slides=len(slides_sorted),
        full_master_prompt=full,
    )


def _build_full_master_prompt(
    purpose: str,
    audience: str,
    style: str,
    primary_color: str,
    primary_layout: str,
    design_description: DesignDescription,
    slides: list[SlideInstruction],
    language: str,
) -> str:
    """Ghép thành chuỗi hoàn chỉnh để user copy vào AI khác."""
    n = len(slides)

    if language == "vi":
        role_text = (
            "Bạn là chuyên gia thiết kế slide PowerPoint với 10+ năm kinh nghiệm trong thiết kế trình bày trực quan và kể chuyện bằng dữ liệu. "
        )
        task_text = (
            f"Hãy tạo BỘ SLIDE THUYẾT TRÌNH hoàn chỉnh cho toàn bộ nội dung sau đây gồm {n} slide "
            f"Đọc kĩ INSTRUCTION VÀ CONTENT của từng slide "
            f"Sau đó trình bày, bố trí nội dung và hình ảnh(nếu có) trong từng slide đẹp mắt, logic giữa các slide với nhau "
            f"Đảm bảo phong cách thiết kế đồng nhất xuyên suốt cả bộ. Mỗi slide cần có tiêu đề. "
        )
        guideline_text = (
            f"Mục tiêu của bộ slide là {purpose}, hướng đến đối tượng {audience} "
            f"với phong cách thiết kế {style}. "
            f"Màu sắc chủ đạo là {primary_color} và layout chính theo dạng {primary_layout}."
        )
        desc_text = (
            f"Tone: {design_description.tone}\n"
            f"Font: {design_description.font}\n"
            f"Key Message Rule: {design_description.key_message_rule}\n"
            f"Density: {design_description.density}\n"
            f"Visual: {design_description.visual}"
        )
        format_text = (
            f"Output phải là file thuyết trình thực tế (.pptx) mở được trong PowerPoint/Google Slides\n"
            f"KHÔNG phải code, KHÔNG phải mô tả bằng văn bản.\n"
        )
        note_text = (
            "NỘI DUNG trên slide phải dựa trên thông tin thực tế từ tài liệu gốc. "
            "Tuyệt đối không bịa đặt số liệu hay thông tin mới."
        )
        headers = {
            "role":    "[VAI TRÒ]",
            "task":    "[NHIỆM VỤ]",
            "guide":   "[CHỈ DẪN]",
            "desc":    "[MÔ TẢ THIẾT KẾ]",
            "format":  "[YÊU CẦU FORMAT OUTPUT]",
            "note":    "[LƯU Ý]",
            "content": "[NỘI DUNG TỪNG SLIDE]",
            "no_doc":  "(Không có tài liệu — hãy tạo nội dung phù hợp dựa trên tiêu đề và instruction)",
            "closing": "Bây giờ hãy bắt đầu tạo Slide PowerPoint cho tất cả slide theo format trên.",
        }
    else:
        role_text = (
            "You are a PowerPoint slide design expert with 10+ years of experience in visual presentation design and data storytelling. "
        )
        task_text = (
            f"Please create a complete PRESENTATION DECK for the following content consisting of {n} slides. "
            f"Read the INSTRUCTION AND CONTENT of each slide carefully. "
            f"Then present, arrange the content and images (if any) in each slide beautifully and logically with each other. "
            f"Ensure a consistent design style throughout the deck. Each slide must have a title. "
        )
        guideline_text = (
            f"The goal of this presentation is {purpose}, targeting {audience} "
            f"with a {style} design style. "
            f"The primary color is {primary_color} and the main layout follows the {primary_layout} format."
        )
        desc_text = (
            f"Tone: {design_description.tone}\n"
            f"Font: {design_description.font}\n"
            f"Key Message Rule: {design_description.key_message_rule}\n"
            f"Density: {design_description.density}\n"
            f"Visual: {design_description.visual}"
        )
        format_text = (
            f"The output must be an actual presentation file (.pptx) that can be opened in PowerPoint/Google Slides.\n"
            f"NOT code, NOT written descriptions.\n"
        )
        note_text = (
            "Use factual information from the source document. "
            "Do not fabricate data."
        )
        headers = {
            "role":    "[YOUR ROLE]",
            "task":    "[YOUR TASK]",
            "guide":   "[GUIDELINES]",
            "desc":    "[DESIGN DESCRIPTION]",
            "format":  "[OUTPUT FORMAT]",
            "note":    "[NOTE]",
            "content": "[SLIDE CONTENT]",
            "no_doc":  "(No source material — create appropriate content based on title and instruction)",
            "closing": "Now please create PowerPoint slides for all items above.",
        }

    lines = [
        headers["role"],
        role_text,
        "",
        headers["task"],
        task_text,
        "",
        headers["guide"],
        guideline_text,
        "",
        headers["desc"],
        desc_text,
        "",
        headers["note"],
        note_text,
        "",
        headers["format"],
        format_text,
        "",
        "=" * 60,
        headers["content"],
        "=" * 60,
        "",
    ]

    for slide in slides:
        lines.append(f"## Slide {slide.index} — {slide.title}")
        lines.append(f"INSTRUCTION: {slide.instruction}")
        if slide.content and slide.content.strip():
            lines.append(f"CONTENT: {slide.content}")
        else:
            lines.append(f"CONTENT: {headers['no_doc']}")
        lines.append("")

    lines.append("=" * 60)
    lines.append(headers["closing"])

    return "\n".join(lines)


# ── Helper ─────────────────────────────────────────────────────────────
# Xóa markdown code fence (```json ... ```) nếu model trả về
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _safe_parse(raw: str) -> dict:
    """Parse JSON từ Gemini response. Raise ValueError nếu parse thất bại (để tenacity retry)."""
    if not raw:
        # resp.text là None hoặc "" khi Gemini lọc nội dung (SAFETY/RECITATION)
        raise ValueError("Gemini trả về response rỗng hoặc None")
    cleaned = _CODE_FENCE_RE.sub("", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        logger.error(f"Full raw response:\n{raw}")
        raise ValueError(f"Gemini trả về JSON không hợp lệ: {e}") from e
