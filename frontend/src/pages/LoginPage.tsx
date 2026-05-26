import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import './AuthPage.css'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successBanner, setSuccessBanner] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Đọc query param khi mount (sau khi backend redirect)
  useEffect(() => {
    const verified = searchParams.get('verified')
    const errorMsg = searchParams.get('error')
    const verifyMsg = searchParams.get('msg')

    if (verified === 'success') {
      setSuccessBanner('Xác thực email thành công. Vui lòng đăng nhập.')
    } else if (verified === 'error') {
      setError(verifyMsg || 'Xác thực email thất bại. Link có thể đã hết hạn.')
    } else if (errorMsg) {
      setError(errorMsg)
    }

    // Xóa query params khỏi URL sau khi đọc xong
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
      setError(err.response?.data?.detail || 'Đăng nhập thất bại')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = authAPI.googleLoginUrl()
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Đăng nhập</h1>

        {successBanner && <div className="success-message">{successBanner}</div>}
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
            <label>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="divider">hoặc</div>

        <button onClick={handleGoogleLogin} className="btn-google">
          Đăng nhập bằng Google
        </button>

        <p className="auth-link">
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      </div>
    </div>
  )
}