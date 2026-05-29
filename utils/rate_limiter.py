"""
utils/rate_limiter.py
Rate limiter in-memory cho login attempts.
KHÔNG dùng Redis — đơn giản hóa cho đồ án sinh viên.
Khi server restart, counter sẽ reset (chấp nhận được).
"""
from datetime import datetime, timedelta
from threading import Lock

from utils.config import get_settings

settings = get_settings()


class LoginAttemptTracker:
    """
    Theo dõi số lần đăng nhập sai theo email.
    Dùng dict + Lock để thread-safe.
    Tự động xoá các lần thử cũ ngoài cửa sổ LOCKOUT_MINUTES.
    """

    def __init__(self):
        # email -> list[datetime] (các thời điểm fail)
        self._attempts: dict[str, list[datetime]] = {}
        self._lock = Lock()

    def record_failed_attempt(self, email: str) -> None:
        """Ghi nhận 1 lần đăng nhập thất bại."""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(email, now)
            self._attempts.setdefault(email, []).append(now)

    def is_locked(self, email: str) -> bool:
        """Có bị khoá tạm thời không?"""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(email, now)
            return len(self._attempts.get(email, [])) >= settings.MAX_LOGIN_ATTEMPTS

    def reset(self, email: str) -> None:
        """Xoá counter (gọi sau khi login thành công)."""
        with self._lock:
            self._attempts.pop(email, None)

    def _cleanup_unlocked(self, email: str, now: datetime) -> None:
        """
        Xoá các lần thử ngoài cửa sổ thời gian.
        CHỈ gọi khi đã giữ lock.
        """
        cutoff = now - timedelta(minutes=settings.LOCKOUT_MINUTES)
        if email in self._attempts:
            self._attempts[email] = [
                t for t in self._attempts[email] if t > cutoff
            ]
            if not self._attempts[email]:
                self._attempts.pop(email, None)


# Singleton dùng chung toàn app
login_tracker = LoginAttemptTracker()