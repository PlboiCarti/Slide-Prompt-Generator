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
      <div className="auth-glow auth-glow-pink" />
      <div className="auth-glow auth-glow-blue" />

      <div className="auth-shell">
        <section className="auth-side-panel">
          <button className="auth-brand" onClick={() => navigate('/')}>
            <span className="auth-brand-logo">PB</span>
            <span>Slide Prompt Builder</span>
          </button>

          <div className="auth-side-content">
            <span className="auth-kicker">AI Prompt Workflow</span>
            <h2>
              Welcome back to your
              <span> cyber slide console.</span>
            </h2>
            <p>
              Đăng nhập để tiếp tục tạo Master Prompt, phân tích hướng thiết kế
              và sinh cấu trúc slide bằng AI.
            </p>
          </div>

          <div className="auth-side-stats">
            <div>
              <strong>2 Phase</strong>
              <span>Design + Prompt</span>
            </div>
            <div>
              <strong>AI Ready</strong>
              <span>Gemini pipeline</span>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <span className="auth-card-badge">Secure Login</span>
            <h1>Đăng nhập</h1>
            <p>Truy cập Prompt Builder console của bạn.</p>
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="divider">hoặc</div>

          <button onClick={handleGoogleLogin} className="btn-google">
            <span className="google-dot">G</span>
            Đăng nhập bằng Google
          </button>

          <p className="auth-link">
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </p>
        </section>
      </div>
    </div>
  )
}