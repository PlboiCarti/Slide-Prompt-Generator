import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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

  // Sau khi đăng ký xong → hiện màn hình "Kiểm tra email"
  if (registeredEmail) {
    return (
      <div className="auth-container">
        <div className="auth-card auth-card-center">
          <div className="auth-icon-success">✓</div>
          <h1>Đăng ký thành công</h1>
          <p className="auth-card-text">
            Một email xác thực đã được gửi đến
            <br />
            <strong>{registeredEmail}</strong>
          </p>
          <p className="auth-card-hint">
            Vui lòng kiểm tra hộp thư (cả thư mục spam) và click vào link xác thực để
            hoàn tất đăng ký.
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
      <div className="auth-card">
        <h1>Đăng ký</h1>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu (tối thiểu 8 ký tự)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
      </div>
    </div>
  )
}