"""
schemas/prompt.py — Schema cho Master Prompt output
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class DesignDescription(BaseModel):
    """
    Mô tả thiết kế từ Phase 1.
    Frontend hiển thị thành 5 ô input riêng — user có thể chỉnh sửa từng ô.
    """
    tone: str
    font: str
    key_message_rule: str
    density: str
    visual: str


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
    system_instruction: str
    slide_instructions: list[SlideInstruction]
    total_slides: int
    full_master_prompt: str  # toàn bộ prompt — user copy 1 lần
