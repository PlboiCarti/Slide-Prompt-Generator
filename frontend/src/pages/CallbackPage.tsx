import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function CallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { checkAuth } = useAuth()

  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      // Lỗi từ Google OAuth → quay về login kèm message
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true })
      return
    }

    // Thành công → checkAuth (đọc cookie) → vào /generate
    checkAuth()
      .then(() => navigate('/generate', { replace: true }))
      .catch(() => navigate('/login', { replace: true }))
  }, [searchParams, navigate, checkAuth])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '40px 48px',
          borderRadius: 16,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid #eef2ff',
            borderTopColor: '#667eea',
            borderRadius: '50%',
            margin: '0 auto 20px',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ color: '#4b5563', margin: 0 }}>Đang đăng nhập...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}