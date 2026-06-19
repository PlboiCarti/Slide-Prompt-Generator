/**
 * LoginPage — Trang đăng nhập (email/password + Google OAuth)
 *
 * Đọc query params từ URL khi load lần đầu để hiển thị thông báo xác thực email
 * (?verified=success) hoặc lỗi OAuth (?error=...) rồi xóa params khỏi URL ngay —
 * tránh banner hiện lại nếu người dùng F5 trang sau khi đã đọc.
 */
import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import { ThemeToggle } from '../components/ThemeToggle'
import './AuthPage.css'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successBanner, setSuccessBanner] = useState('')
  const [showVerifiedSuccess, setShowVerifiedSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Chạy một lần khi mount để đọc query params từ redirect (email verify / Google OAuth).
  // setSearchParams({}, { replace: true }) dọn URL ngay sau khi đọc xong để banner
  // không hiện lại nếu người dùng F5. deps=[] là cố ý — chỉ đọc lúc mount.
  useEffect(() => {
    const verified = searchParams.get('verified')
    const errorMsg = searchParams.get('error')
    const verifyMsg = searchParams.get('msg')

    if (verified === 'success') {
      // Tab vừa mở từ link verify trong email, hoặc tab đăng ký vừa tự
      // chuyển tới đây sau khi polling phát hiện email đã verify.
      setShowVerifiedSuccess(true)
    } else if (verified === 'error') {
      setError(verifyMsg || 'Xác thực email thất bại. Link có thể đã hết hạn.')
    } else if (errorMsg) {
      setError(errorMsg)
    }

    if (verified || errorMsg) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessBanner('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/generate')
    } catch (err: any) {
      // err.response?.data?.detail — chuỗi lỗi từ FastAPI (sai mật khẩu, chưa verify email, v.v.)
      setError(err.response?.data?.detail || 'Đăng nhập thất bại')
    } finally {
      setIsLoading(false)
    }
  }

  // Hard redirect thay vì navigate() — OAuth cần browser rời khỏi SPA để đến Google.
  const handleGoogleLogin = () => {
    window.location.href = authAPI.googleLoginUrl()
  }

  // Tab vừa xác thực email xong (mở từ link trong email) → hiện màn xác nhận
  if (showVerifiedSuccess) {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-center">
          <div className="auth-icon-success">✓</div>
          <h1>Đăng ký thành công!</h1>
          <p className="auth-card-text">
            Email của bạn đã được xác thực. Tài khoản đã sẵn sàng sử dụng.
          </p>
          <button
            onClick={() => {
              setShowVerifiedSuccess(false)
              setSuccessBanner('Vui lòng đăng nhập để tiếp tục.')
            }}
            className="btn-primary"
          >
            Quay về đăng nhập
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <ThemeToggle />
      <div className="auth-glow auth-glow-pink" />
      <div className="auth-glow auth-glow-blue" />

      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-card-header">
            <button className="auth-brand" onClick={() => navigate('/')}>
              <span className="auth-brand-logo">PB</span>
              <span className="auth-brand-name">Prompt Builder</span>
            </button>
            <span className="auth-kicker">AI Prompt Workflow</span>
            <h1>Chào mừng trở lại</h1>
            <p>Truy cập workspace và tiếp tục xây dựng Master Prompt của bạn.</p>
          </div>

          {successBanner && <div className="success-message">{successBanner}</div>}
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Mật khẩu</label>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="divider">hoặc tiếp tục với</div>

          <button onClick={handleGoogleLogin} className="btn-google">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Đăng nhập bằng Google
          </button>

          <p className="auth-link">
            Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
