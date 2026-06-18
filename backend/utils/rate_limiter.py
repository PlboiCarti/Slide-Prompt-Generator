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
    Theo dõi số lần thử theo key (email hoặc user_id).
    Dùng dict + Lock để thread-safe.
    Tự động xoá các lần thử cũ ngoài cửa sổ lockout_minutes.
    """

    def __init__(self, max_attempts: int, lockout_minutes: int):
        self._max_attempts = max_attempts
        self._lockout_minutes = lockout_minutes
        self._attempts: dict[str, list[datetime]] = {}
        self._lock = Lock()

    def record_attempt(self, key: str) -> None:
        """Ghi nhận 1 lần thử."""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(key, now)
            self._attempts.setdefault(key, []).append(now)

    def is_locked(self, key: str) -> bool:
        """Có bị khoá tạm thời không?"""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(key, now)
            return len(self._attempts.get(key, [])) >= self._max_attempts

    def get_attempts(self, key: str) -> int:
        """Trả về số lần thử trong cửa sổ hiện tại."""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(key, now)
            return len(self._attempts.get(key, []))

    def reset(self, key: str) -> None:
        """Xoá counter (gọi sau khi login thành công)."""
        with self._lock:
            self._attempts.pop(key, None)

    def time_until_unlock(self, key: str) -> int:
        """Số giây còn lại cho đến khi lock hết hiệu lực. 0 nếu không bị lock."""
        with self._lock:
            now = datetime.utcnow()
            self._cleanup_unlocked(key, now)
            attempts = self._attempts.get(key, [])
            if len(attempts) < self._max_attempts:
                return 0
            oldest = min(attempts)
            unlock_at = oldest + timedelta(minutes=self._lockout_minutes)
            remaining = (unlock_at - now).total_seconds()
            return max(0, int(remaining))

    def _cleanup_unlocked(self, key: str, now: datetime) -> None:
        """Xoá các lần thử ngoài cửa sổ thời gian. CHỈ gọi khi đã giữ lock."""
        cutoff = now - timedelta(minutes=self._lockout_minutes)
        if key in self._attempts:
            self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
            if not self._attempts[key]:
                self._attempts.pop(key, None)


# Singleton dùng chung toàn app
login_tracker = LoginAttemptTracker(
    max_attempts=settings.MAX_LOGIN_ATTEMPTS,
    lockout_minutes=settings.LOCKOUT_MINUTES,
)

generate_tracker = LoginAttemptTracker(
    max_attempts=settings.MAX_GENERATE_ATTEMPTS,
    lockout_minutes=settings.GENERATE_LOCKOUT_MINUTES,
)

resend_tracker = LoginAttemptTracker(
    max_attempts=settings.MAX_RESEND_ATTEMPTS,
    lockout_minutes=settings.RESEND_LOCKOUT_MINUTES,
)

verification_status_tracker = LoginAttemptTracker(
    max_attempts=settings.MAX_VERIFICATION_STATUS_ATTEMPTS,
    lockout_minutes=settings.VERIFICATION_STATUS_LOCKOUT_MINUTES,
)