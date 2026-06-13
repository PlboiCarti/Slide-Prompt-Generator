from __future__ import annotations

import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)


def cleanup_uploads_dir(ttl_hours: int = 24, uploads_dir: str | Path = "uploads") -> int:
    """Xóa các thư mục upload tạm đã cũ hơn TTL."""
    root = Path(uploads_dir)
    if not root.exists():
        return 0

    cutoff = datetime.utcnow() - timedelta(hours=ttl_hours)
    deleted_count = 0

    for item in root.iterdir():
        if not item.is_dir():
            continue

        try:
            modified_at = datetime.utcfromtimestamp(item.stat().st_mtime)
            if modified_at >= cutoff:
                continue

            shutil.rmtree(item)
            deleted_count += 1
            logger.info("Deleted stale upload directory: %s", item)
        except Exception as exc:
            logger.warning("Could not delete stale upload directory %s: %s", item, exc)

    return deleted_count
