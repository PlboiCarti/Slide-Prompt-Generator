/**
 * RegisterPage — Trang đăng ký tài khoản mới
 *
 * Validate client-side (password match, độ dài) trước khi gọi API để tiết kiệm
 * round-trip và cho feedback tức thì mà không cần chờ server.
 *
 * Sau khi đăng ký thành công, component không navigate sang trang khác mà render
 * màn hình "Kiểm tra email" ngay tại chỗ — giữ người dùng focus vào việc verify email.
 * registeredEmail !== '' là điều kiện để hiện màn hình đó.
 */
import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import './AuthPage.css'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate trước khi gọi API — tránh round-trip không cần thiết, cho phản hồi tức thì.
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp')
      return
    }

    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự')
      return
    }

    setIsLoading(true)

    try {
      await register(email, password)
      // Lưu email để hiện trên màn hình xác nhận; khi registeredEmail !== '' component
      // render màn hình "Kiểm tra hộp thư" thay vì form đăng ký.
      setRegisteredEmail(email)
    } catch (err: any) {
      // err.response?.data?.detail — chuỗi lỗi từ FastAPI (email đã tồn tại, v.v.)
      setError(err.response?.data?.detail || 'Đăng ký thất bại')
    } finally {
      setIsLoading(false)
    }
  }

  if (registeredEmail) {
    return (
      <div className="auth-container">
        <ThemeToggle />
        <div className="auth-glow auth-glow-pink" />
        <div className="auth-glow auth-glow-blue" />

        <div className="auth-card auth-card-center auth-success-card">
          <div className="auth-icon-success">✓</div>

          <span className="auth-card-badge">Email Verification</span>
          <h1>Đăng ký thành công</h1>

          <p className="auth-card-text">
            Một email xác thực đã được gửi đến
            <br />
            <strong>{registeredEmail}</strong>
          </p>

          <p className="auth-card-hint">
            Vui lòng kiểm tra hộp thư, kể cả thư mục spam, rồi click vào link xác thực
            để hoàn tất đăng ký.
          </p>

          <button onClick={() => navigate('/login')} className="btn-primary">
            Về trang đăng nhập
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
            <span className="auth-kicker">Tạo tài khoản</span>
            <h1>Bắt đầu hành trình</h1>
            <p>Lưu draft, xem lịch sử và xây dựng Master Prompt chuyên nghiệp.</p>
          </div>

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
                  placeholder="Tối thiểu 8 ký tự"
                  required
                  minLength={8}
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

            <div className="form-group">
              <label>Xác nhận mật khẩu</label>
              <div className="password-input-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showConfirmPassword ? (
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
              {isLoading ? 'Đang đăng ký...' : 'Đăng ký'}
            </button>
          </form>

          <p className="auth-link">
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
