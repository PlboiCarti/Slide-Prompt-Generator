import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import { ThemeToggle } from '../components/ThemeToggle'
import './AuthPage.css'

const PENDING_VERIFICATION_KEY = 'pendingEmailVerification'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 phút
const RESEND_COOLDOWN_MS = 120 * 1000 // 120 giây

interface PendingVerification {
  email: string
  startedAt: number
}

function readPendingVerification(): PendingVerification | null {
  const raw = localStorage.getItem(PENDING_VERIFICATION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.email === 'string' && typeof parsed.startedAt === 'number') {
      return parsed
    }
  } catch {
    // dữ liệu cũ/hỏng → bỏ qua
  }
  return null
}

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pending, setPending] = useState<PendingVerification | null>(readPendingVerification)
  const [pollingExpired, setPollingExpired] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
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
      const newPending: PendingVerification = { email, startedAt: Date.now() }
      localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(newPending))
      setPending(newPending)
      setPollingExpired(false)
    } catch (err: any) {
      // err.response?.data?.detail — chuỗi lỗi từ FastAPI (email đã tồn tại, v.v.)
      setError(err.response?.data?.detail || 'Đăng ký thất bại')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegisterDifferentEmail = () => {
    localStorage.removeItem(PENDING_VERIFICATION_KEY)
    setPending(null)
    setPollingExpired(false)
    setResendMessage('')
  }

  const handleResend = async () => {
    if (!pending) return
    setIsResending(true)
    setResendMessage('')
    try {
      const { data } = await authAPI.resendVerification(pending.email)
      const refreshed: PendingVerification = { email: pending.email, startedAt: Date.now() }
      localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(refreshed))
      setPending(refreshed)
      setPollingExpired(false)
      setResendError(false)
      setResendMessage(data.message)
    } catch (err: any) {
      setResendError(true)
      setResendMessage(err.response?.data?.detail || 'Gửi lại email thất bại, vui lòng thử lại.')
    } finally {
      setIsResending(false)
    }
  }

  useEffect(() => {
    if (!pending) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let expired = false

    const checkStatus = async () => {
      if (Date.now() - pending.startedAt > POLL_TIMEOUT_MS) {
        expired = true
        setPollingExpired(true)
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
        return
      }
      try {
        const { data } = await authAPI.getVerificationStatus(pending.email)
        if (!cancelled && data.verified) {
          localStorage.removeItem(PENDING_VERIFICATION_KEY)
          navigate('/login?verified=success', { replace: true })
        }
      } catch {
        // Lỗi tạm thời (mất mạng...) → bỏ qua, thử lại ở lần poll tiếp theo
      }
    }

    const startPolling = () => {
      if (intervalId || expired) return
      checkStatus()
      intervalId = setInterval(checkStatus, POLL_INTERVAL_MS)
    }

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pending, navigate])

  useEffect(() => {
    if (!pending) {
      setCooldownRemaining(0)
      return
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((pending.startedAt + RESEND_COOLDOWN_MS - Date.now()) / 1000)
      )
      setCooldownRemaining(remaining)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [pending])

  if (pending) {
    return (
      <div className="auth-container">
        <ThemeToggle />
        <div className="auth-card auth-card-center">
          <div className="auth-icon-success">✉</div>
          <h1>Xác thực email để hoàn tất đăng ký</h1>
          <p className="auth-card-text">
            Một email xác thực đã được gửi đến
            <br />
            <strong>{pending.email}</strong>
          </p>

          <p className="auth-card-hint">
            Vui lòng kiểm tra hộp thư (cả thư mục spam) và click vào link xác thực để
            hoàn tất đăng ký. Trang này sẽ tự động chuyển tiếp khi xác thực xong.
          </p>

          {pollingExpired && (
            <p className="auth-card-hint">
              Đã quá 10 phút mà chưa xác thực — tự động kiểm tra đã tạm dừng. Bấm
              "Gửi lại email xác thực" để nhận link mới và tiếp tục.
            </p>
          )}

          {resendMessage && (
            <div className={resendError ? 'error-message' : 'success-message'}>
              {resendMessage}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={isResending || cooldownRemaining > 0}
            className="btn-primary"
          >
            {isResending
              ? 'Đang gửi lại...'
              : cooldownRemaining > 0
                ? `Gửi lại sau ${cooldownRemaining}s`
                : 'Gửi lại email xác thực'}
          </button>


          <button onClick={() => navigate('/login')} className="btn-primary">
            Về trang đăng nhập
          </button>
          <button onClick={handleRegisterDifferentEmail} className="btn-text">
            Đăng ký bằng email khác
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
