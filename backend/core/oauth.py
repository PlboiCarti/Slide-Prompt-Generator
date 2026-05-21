"""
core/oauth.py — Cấu hình Google OAuth với Authlib
"""
from authlib.integrations.starlette_client import OAuth

from utils.config import get_settings

_settings = get_settings()

oauth = OAuth()

# Đăng ký Google làm provider
oauth.register(
    name="google",
    client_id=_settings.GOOGLE_CLIENT_ID,
    client_secret=_settings.GOOGLE_CLIENT_SECRET,

    # Authlib tự fetch metadata từ Google (endpoints, public keys, ...)
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",

    client_kwargs={
        # Scope tối thiểu — chỉ lấy email và profile cơ bản
        "scope": "openid email profile"
    },
)