"""
services/llm_service.py — Sinh Master Prompt dùng Gemini

Pipeline 2 giai đoạn:
  Phase 1 (sync)  : generate_design_description()  → DesignDescription
  Phase 2 (async) : generate_slide_structure()      → list[SlideInstruction]
                    fill_slide_contents()            → list[SlideInstruction] + content
                    assemble_master_prompt()         → MasterPromptResult
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from schemas.prompt import ColorPalette, DesignDescription, MasterPromptResult, SlideInstruction
from utils.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client = genai.Client(
    api_key=settings.gemini_api_key,
    http_options=types.HttpOptions(timeout=90000),  # milliseconds → 90 giây
)


def _json_config(temp: float = 0.7, tokens: int = 4000) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        temperature=temp,
        max_output_tokens=tokens,
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=0),  # tắt thinking cho task JSON đơn giản
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

    language_type = "Tiếng Việt" if language == "vi" else "English"

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
    - font: Đúng 1 tên font chữ duy nhất — KHÔNG dùng "hoặc", không giải thích, chỉ chọn Font chữ có hỗ trợ {language_type}
    - key_message_rule: Cách trình bày ý chính trên slide (ngắn, súc tích, in đậm, v.v.)
    - density: Mật độ nội dung — số bullet tối đa, tỉ lệ chữ/hình, v.v.
    - visual: Hướng dẫn visual hierarchy (yếu tố nào được nhấn mạnh/làm nổi bật), loại hình ảnh/icon/biểu đồ phù hợp, và cách bố trí không gian (spacing, căn lề, tỉ lệ vùng nội dung)
    - Trả về JSON hợp lệ, KHÔNG markdown code fence
    - QUAN TRỌNG:
        + Trả về JSON hợp lệ tuyệt đối
        + Mỗi value phải là string 1 dòng duy nhất
        + KHÔNG xuống dòng trong bất kỳ value nào
        + Mỗi value tối đa 60 từ, đủ cụ thể và sinh động
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
        resp = _client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=_json_config(temp=0.7, tokens=2000),
        )

    parsed = _safe_parse(resp.text)
    logger.info("Design description generated")

    return DesignDescription(
        tone=parsed.get("tone", ""),
        font=parsed.get("font", ""),
        key_message_rule=parsed.get("key_message_rule", ""),
        density=parsed.get("density", ""),
        visual=parsed.get("visual", ""),
        # placeholder — caller fills in via generate_color_palette() right after
        color_palette=ColorPalette(primary="", secondary="", accent="", neutrals=[], description=""),
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def generate_color_palette(
    primary_color: str,
    style: str,
    language: str,
) -> ColorPalette:
    """
    Phase 1 — Sinh bảng màu (secondary/accent/neutrals/description) dựa trên
    primary_color do user chọn + style.
    `primary` lấy trực tiếp từ tham số đầu vào — KHÔNG qua Gemini.

    Độc lập với generate_design_description() (không nhận tone/purpose/audience)
    → có thể gọi ĐỒNG THỜI với generate_design_description() (ThreadPoolExecutor),
    không tạo dependency chờ nhau giữa 2 lệnh Gemini.
    """
    lang_instr = (
        "Toàn bộ nội dung PHẢI bằng tiếng Việt."
        if language == "vi"
        else "All content MUST be in English."
    )

    prompt = f"""
<task>
    Bạn là chuyên gia color theory cho thiết kế slide thuyết trình chuyên nghiệp.
    Dựa trên màu chủ đạo (primary) do người dùng chọn, hãy đề xuất một BẢNG MÀU hoàn chỉnh,
    hài hoà, hiện đại — tránh cảm giác đơn điệu (chỉ 1 màu xuyên suốt) hoặc rập khuôn AI.
</task>

<input>
    Màu chủ đạo (primary, KHÔNG thay đổi): {primary_color}
    Phong cách thiết kế: {style}
    Ngôn ngữ: {language}
</input>

<rules>
    - {lang_instr}
    - secondary: 1 mã hex màu phụ — phối hợp hài hoà với primary (analogous/complementary/triadic
      tuỳ phong cách), đủ tương phản để phân biệt vai trò
    - accent: 1 mã hex màu nhấn — dùng cho CTA, số liệu nổi bật, icon quan trọng;
      tương phản rõ với primary và secondary
    - neutrals: mảng 2-3 mã hex màu trung tính (trắng/xám/đen hoặc tông ấm/lạnh nhẹ tương ứng
      phong cách) dùng cho nền, text, đường kẻ
    - description: mô tả NGẮN GỌN (3-5 câu, không xuống dòng) gồm:
        + Tên gọi/vai trò từng màu và lý do phối hợp với primary
        + Quy tắc tỉ lệ sử dụng — VÍ DỤ: "Primary chiếm 50-60% diện tích, Secondary và Accent
          mỗi màu 15-20%, Neutrals 20-25% còn lại cho nền/văn bản"
        + CẢNH BÁO phong cách: 1-2 điều KHÔNG nên làm để tránh trông rập khuôn/AI-generated,
          ví dụ: "KHÔNG dùng solid color bar/stripe accent ở cạnh slide — trông cliché"
    - Tất cả mã hex phải đúng định dạng #RRGGBB (chữ hoa)
    - Trả về JSON hợp lệ, KHÔNG markdown code fence
    - QUAN TRỌNG: mỗi value (trừ neutrals) là string 1 dòng, KHÔNG xuống dòng; description tối đa 80 từ
</rules>

JSON Schema:
{{
  "secondary":    "#RRGGBB",
  "accent":       "#RRGGBB",
  "neutrals":     ["#RRGGBB", "#RRGGBB"],
  "description":  "..."
}}"""

    with _timed("Phase1 generate_color_palette"):
        resp = _client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=6000,
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=1024),
            ),
        )

    parsed = _safe_parse(resp.text)
    logger.info("Color palette generated")

    return ColorPalette(
        primary=primary_color,
        secondary=parsed.get("secondary", ""),
        accent=parsed.get("accent", ""),
        neutrals=parsed.get("neutrals", []),
        description=parsed.get("description", ""),
    )


def generate_design_bundle(
    purpose: str,
    audience: str,
    style: str,
    layout: str,
    color: str,
    language: str,
) -> DesignDescription:
    """Sync version — dùng cho pipeline_worker (chạy trong thread, không có event loop)."""
    with ThreadPoolExecutor(max_workers=2) as executor:
        desc_future = executor.submit(
            generate_design_description,
            purpose=purpose, audience=audience, style=style,
            layout=layout, color=color, language=language,
        )
        palette_future = executor.submit(
            generate_color_palette,
            primary_color=color, style=style, language=language,
        )
        result = desc_future.result(timeout=300)
        result.color_palette = palette_future.result(timeout=300)
    return result


async def generate_design_bundle_async(
    purpose: str,
    audience: str,
    style: str,
    layout: str,
    color: str,
    language: str,
) -> DesignDescription:
    """Async version — dùng cho Phase 1 HTTP handler (async def endpoint)."""
    result, palette = await asyncio.gather(
        asyncio.to_thread(
            generate_design_description,
            purpose=purpose, audience=audience, style=style,
            layout=layout, color=color, language=language,
        ),
        asyncio.to_thread(
            generate_color_palette,
            primary_color=color, style=style, language=language,
        ),
    )
    result.color_palette = palette
    return result


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
        resp = _client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=_json_config(temp=0.5, tokens=3000),
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
    design_description: DesignDescription | None = None,
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

    tone            = design_description.tone            if design_description else ""
    density         = design_description.density         if design_description else ""
    key_message_rule = design_description.key_message_rule if design_description else ""

    # Chia batch nếu > 10 slides để tránh prompt quá dài
    try:
        if n > 10:
            mid = n // 2
            first_contents = _split_batch(
                content, slide_titles[:mid], language,
                tone=tone, density=density, key_message_rule=key_message_rule,
                start_index=1,
            )
            second_contents = _split_batch(
                content, slide_titles[mid:], language,
                tone=tone, density=density, key_message_rule=key_message_rule,
                start_index=mid + 1,
            )
            all_contents = first_contents + second_contents
        else:
            all_contents = _split_batch(
                content, slide_titles, language,
                tone=tone, density=density, key_message_rule=key_message_rule,
                start_index=1,
            )
    except Exception:
        # Sau 3 lần retry vẫn lỗi → fallback về content rỗng, không crash job
        logger.warning("B3 _split_batch thất bại sau retry — tiếp tục với content rỗng", exc_info=True)
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
    tone: str = "",
    density: str = "",
    key_message_rule: str = "",
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

    design_block = ""
    if tone or density or key_message_rule:
        parts = []
        if tone:
            parts.append(f"    - Tone (giọng điệu): {tone}")
        if density:
            parts.append(f"    - Density (mật độ nội dung): {density}")
        if key_message_rule:
            parts.append(f"    - Key message rule: {key_message_rule}")
        design_block = "\n<design_constraints>\n" + "\n".join(parts) + "\n</design_constraints>\n"

    prompt = f"""
<task>
    Phân chia nội dung tài liệu thành ĐÚNG {n} đoạn,
    mỗi đoạn tương ứng với 1 tiêu đề slide.
</task>
{design_block}
<slide_titles>
{titles_str}
</slide_titles>

<content>
{content}
</content>

<rules>
    - Bám sát nội dung tài liệu, KHÔNG bịa thêm thông tin
    - Tuân thủ density để quyết định độ dài và số lượng ý trong mỗi đoạn
    - Viết theo tone đã chỉ định
    - Mỗi đoạn chỉ truyền đạt thông điệp chính theo key_message_rule
    - Nếu tài liệu không có thông tin cho slide → chuỗi rỗng ""
    - {lang_instr}
    - Trả về JSON, KHÔNG markdown code fence
    - PHẢI đủ ĐÚNG {n} phần tử trong mảng contents
</rules>

JSON: {{"contents": ["nội dung slide 1", "nội dung slide 2", ...]}}"""

    with _timed(f"B3 _split_batch ({n} slides, start={start_index})"):
        resp = _client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=6000,
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=1024),
            ),
        )

    parsed = _safe_parse(resp.text)
    contents = parsed.get("contents", [])

    # None hoặc sai kiểu = lỗi cấu trúc từ model → raise để tenacity retry
    if contents is None or not isinstance(contents, list):
        raise ValueError(
            f"B3: 'contents' key missing or wrong type — will retry. "
            f"Response keys: {list(parsed.keys())}"
        )

    # list rỗng hoặc toàn chuỗi rỗng = model quyết định không có nội dung liên quan → KHÔNG retry
    # Pad cho đủ độ dài nếu thiếu phần tử
    while len(contents) < n:
        contents.append("")
    return contents[:n]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def _summarize_chunk(chunk: str, lang_instr: str) -> str:
    prompt = (
        f"Tóm tắt đoạn văn sau, giữ TẤT CẢ thông tin quan trọng "
        f"(số liệu, tên, sự kiện, luận điểm). Không bịa thêm. {lang_instr}\n\n{chunk}"
    )
    resp = _client.models.generate_content(
        model=settings.llm_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=1000,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return (resp.text or "").strip()


def _recursive_summarize(content: str, language: str, max_len: int = 12_000, _depth: int = 0) -> str:
    logger.info(f"Content {len(content)} ký tự — tóm tắt đệ quy (depth={_depth})")
    lang_instr = "Tóm tắt bằng tiếng Việt." if language == "vi" else "Summarize in English."
    chunks = [content[i:i + 4000] for i in range(0, len(content), 4000)]

    summaries: list[str] = []
    for i, chunk in enumerate(chunks):
        with _timed(f"  summarize chunk {i + 1}/{len(chunks)}"):
            text = _summarize_chunk(chunk, lang_instr)
        summaries.append(text)
        logger.info(f"  chunk {i + 1}/{len(chunks)} summarized: {len(chunk)} → {len(text)} ký tự")

    combined = "\n\n".join(summaries)
    if len(combined) > max_len:
        if _depth >= 4:
            logger.warning(f"_recursive_summarize đạt depth tối đa — cắt cứng tại {max_len} ký tự")
            return combined[:max_len]
        return _recursive_summarize(combined, language, max_len, _depth + 1)
    return combined


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — B4: assemble_master_prompt
# ══════════════════════════════════════════════════════════════════════

def assemble_master_prompt(
    purpose: str,
    audience: str,
    style: str,
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


def _format_color_palette_block(palette: ColorPalette, language: str) -> str:
    """Format ColorPalette thành text block cho master prompt (self-contained)."""
    neutrals_str = ", ".join(palette.neutrals) if palette.neutrals else "—"
    if language == "vi":
        return (
            f"- Primary (màu chủ đạo): {palette.primary}\n"
            f"- Secondary (màu phụ): {palette.secondary}\n"
            f"- Accent (màu nhấn): {palette.accent}\n"
            f"- Neutrals (màu trung tính): {neutrals_str}\n"
            f"- Hướng dẫn phối màu: {palette.description}\n"
            f"- BẮT BUỘC áp dụng bảng màu này cho TOÀN BỘ slide — "
            f"KHÔNG chỉ dùng một màu duy nhất xuyên suốt."
        )
    return (
        f"- Primary: {palette.primary}\n"
        f"- Secondary: {palette.secondary}\n"
        f"- Accent: {palette.accent}\n"
        f"- Neutrals: {neutrals_str}\n"
        f"- Usage guidance: {palette.description}\n"
        f"- This palette is MANDATORY for ALL slides — "
        f"do NOT use a single color throughout."
    )


def _build_full_master_prompt(
    purpose: str,
    audience: str,
    style: str,
    primary_layout: str,
    design_description: DesignDescription,
    slides: list[SlideInstruction],
    language: str,
) -> str:
    """Ghép thành chuỗi hoàn chỉnh để user copy vào AI khác."""
    n = len(slides)

    color_palette = _format_color_palette_block(design_description.color_palette, language)

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
            f"với phong cách thiết kế {style} và layout chính theo dạng {primary_layout}."
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
            "palette": "[BẢNG MÀU — BẮT BUỘC]",
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
            f"with a {style} design style and the main layout follows the {primary_layout} format."
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
            "palette": "[COLOR PALETTE — MANDATORY]",
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
        headers["palette"],
        color_palette,
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
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n|\n\s*```\s*$", re.IGNORECASE)


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
