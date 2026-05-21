"""
schemas/prompt.py — Schema cho Master Prompt output
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class SlideInstruction(BaseModel):
    """1 slide trong Master Prompt."""
    index: int
    title: str
    instruction: str
    content: str = ""  # default rỗng cho slide không có content


class MasterPromptResult(BaseModel):
    """Kết quả hoàn chỉnh trả về Frontend."""
    master_prompt_title: str
    system_instruction: str
    slide_instructions: list[SlideInstruction]
    total_slides: int
    full_master_prompt: str  # toàn bộ prompt — user copy 1 lần