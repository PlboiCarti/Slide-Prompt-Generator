"""
schemas/bin.py - Pydantic schemas for Bin items.
"""
from datetime import datetime

from pydantic import BaseModel


class BinItemResponse(BaseModel):
    id: str
    status: str
    purpose: str | None = None
    has_result: bool = False
    error_message: str | None = None
    deleted_at: datetime
    created_at: datetime
