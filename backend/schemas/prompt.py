"""
schemas/prompt.py — Schema cho Master Prompt output
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ColorPalette(BaseModel):
    """
    Bảng màu cho bộ slide — Phase 1.
    `primary` = primary_color do user chọn (backend gán trực tiếp, KHÔNG qua Gemini).
    `secondary/accent/neutrals/description` do Gemini sinh dựa trên primary + style.
    """
    primary: str
    secondary: str
    accent: str
    neutrals: list[str] = Field(default_factory=list)
    description: str


class TypographyRole(BaseModel):
    """Thông số chữ cho 1 vai trò text (title, eyebrow, body, supporting)."""
    size_pt: str
    weight: str
    color: str
    extra: str = ""


class Typography(BaseModel):
    """
    Typography spec cho toàn bộ slide — Phase 1 (Gemini sinh).
    Độc lập với ColorPalette: palette dùng cho background/shape/chart,
    typography colors cố định cho text.
    """
    font_family: str
    font_category: str
    title: TypographyRole
    eyebrow: TypographyRole
    body: TypographyRole
    supporting: TypographyRole
    weights_allowed: str


class DesignDescription(BaseModel):
    """
    Mô tả thiết kế từ Phase 1.
    Frontend hiển thị thành 4 ô input + 1 typography panel + 1 bảng màu — user có thể chỉnh sửa.
    """
    tone: str
    typography: Typography
    key_message_rule: str
    density: str
    visual: str
    color_palette: ColorPalette


class DescribeRequest(BaseModel):
    """Request body cho POST /api/generate-description (Phase 1 — sync)."""
    purpose: str = Field(..., min_length=3, max_length=500)
    audience: str = Field(..., min_length=3, max_length=200)
    style: str = "minimalist"
    primary_layout: str = "key_message"
    primary_color: str = "#FF6B35"
    language: str = "vi"


class SlideInstruction(BaseModel):
    """1 slide trong Master Prompt."""
    index: int
    title: str
    instruction: str
    content: str = ""  # rỗng nếu không có tài liệu


class MasterPromptResult(BaseModel):
    """Kết quả hoàn chỉnh trả về Frontend."""
    master_prompt_title: str
    design_description: DesignDescription
    slide_instructions: list[SlideInstruction]
    total_slides: int
    full_master_prompt: str  # toàn bộ prompt — user copy 1 lần
