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

  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

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
      setRegisteredEmail(email)
    } catch (err: any) {
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                required
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label>Xác nhận mật khẩu</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                required
              />
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
