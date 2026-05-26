import { useState, useEffect, FormEvent, ChangeEvent, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { promptAPI } from '../services/api'
import './GeneratePage.css'

// Phải khớp với backend
const STYLE_OPTIONS = [
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'modern', label: 'Modern' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'academic', label: 'Academic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'creative', label: 'Creative' },
  { value: 'technical', label: 'Technical' },
]

const LAYOUT_OPTIONS = [
  { value: 'key_message', label: 'Key Message' },
  { value: 'split', label: 'Split' },
  { value: 'gridcards', label: 'Grid Cards' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'bigstat_impact', label: 'Big Stat' },
  { value: 'full_image_text_overlay', label: 'Image Overlay' },
]

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chuẩn bị...',
  PROCESSING: 'AI đang phân tích nội dung và tạo cấu trúc slide...',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Đã có lỗi xảy ra',
}

export function GeneratePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    purpose: '',
    audience: '',
    style: 'minimalist',
    primary_color: '#667eea',
    slide_count: 6,
    primary_layout: 'key_message',
    content: '',
    language: 'vi',
  })

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [jobStatus, setJobStatus] = useState<any>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  // Poll status mỗi 2s
  useEffect(() => {
    if (!jobId || !isPolling) return

    const checkStatus = async () => {
      try {
        const response = await promptAPI.getJobStatus(jobId)
        setJobStatus(response.data)
        if (response.data.status === 'COMPLETED' || response.data.status === 'FAILED') {
          setIsPolling(false)
        }
      } catch {
        // ignore
      }
    }

    const timer = setInterval(checkStatus, 2000)
    return () => clearInterval(timer)
  }, [jobId, isPolling])

  // Tự scroll xuống khi xong
  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED' && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [jobStatus?.status])

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'slide_count' ? parseInt(value) : value,
    }))
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPdfFile(e.target.files?.[0] || null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.content.trim() && !pdfFile) {
      alert('Vui lòng cung cấp nội dung text hoặc tệp PDF')
      return
    }

    setIsGenerating(true)
    setJobId(null)
    setJobStatus(null)
    setCopied(false)

    try {
      const response = await promptAPI.generate({
        ...formData,
        pdf_file: pdfFile || undefined,
      })
      setJobId(response.data.job_id)
      setIsPolling(true)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi sinh prompt')
      setIsGenerating(false)
      return
    }
    setIsGenerating(false)
  }

  const handleCopy = async () => {
    const text = jobStatus?.result?.full_master_prompt
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: tạo textarea tạm + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleReset = () => {
    setJobId(null)
    setJobStatus(null)
    setIsPolling(false)
    setCopied(false)
  }

  const status = jobStatus?.status
  const isRunning = isGenerating || status === 'PENDING' || status === 'PROCESSING'

  return (
    <div className="gen-page">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="gen-header">
        <div className="gen-header-inner">
          <div className="gen-brand">
            <div className="gen-logo">PB</div>
            <span className="gen-brand-name">Prompt Builder</span>
          </div>

          <div className="gen-user" onClick={() => setShowUserMenu((v) => !v)}>
            <div className="gen-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
            <span className="gen-user-email">{user?.email}</span>
            <svg
              className={`gen-chevron ${showUserMenu ? 'open' : ''}`}
              width="12" height="12" viewBox="0 0 12 12"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showUserMenu && (
              <div className="gen-user-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={handleLogout}>Đăng xuất</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────── */}
      <main className="gen-main">
        <div className="gen-intro">
          <h1>Tạo Master Prompt</h1>
          <p>
            Điền thông tin về bài thuyết trình, AI sẽ sinh một Master Prompt mà bạn có thể
            copy vào ChatGPT, Claude hoặc Gemini để tạo slide.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="gen-form">
          {/* Section 1: Thông tin cơ bản */}
          <section className="gen-section">
            <h2 className="gen-section-title">
              <span className="gen-section-num">1</span>
              Thông tin cơ bản
            </h2>

            <div className="gen-field-grid">
              <div className="gen-field">
                <label>Mục đích</label>
                <input
                  type="text"
                  name="purpose"
                  value={formData.purpose}
                  onChange={handleInputChange}
                  placeholder="Vd: Báo cáo doanh số Q1"
                  required
                  minLength={3}
                  disabled={isRunning}
                />
              </div>
              <div className="gen-field">
                <label>Đối tượng</label>
                <input
                  type="text"
                  name="audience"
                  value={formData.audience}
                  onChange={handleInputChange}
                  placeholder="Vd: Ban lãnh đạo công ty"
                  required
                  minLength={3}
                  disabled={isRunning}
                />
              </div>
            </div>
          </section>

          {/* Section 2: Thiết kế */}
          <section className="gen-section">
            <h2 className="gen-section-title">
              <span className="gen-section-num">2</span>
              Thiết kế slide
            </h2>

            <div className="gen-field-grid gen-field-grid-4">
              <div className="gen-field">
                <label>Phong cách</label>
                <select name="style" value={formData.style} onChange={handleInputChange} disabled={isRunning}>
                  {STYLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="gen-field">
                <label>Bố cục chính</label>
                <select name="primary_layout" value={formData.primary_layout} onChange={handleInputChange} disabled={isRunning}>
                  {LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="gen-field">
                <label>Số slide</label>
                <input
                  type="number"
                  name="slide_count"
                  value={formData.slide_count}
                  onChange={handleInputChange}
                  min="3"
                  max="30"
                  disabled={isRunning}
                />
              </div>

              <div className="gen-field">
                <label>Ngôn ngữ</label>
                <select name="language" value={formData.language} onChange={handleInputChange} disabled={isRunning}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <div className="gen-field gen-field-color">
              <label>Màu chủ đạo</label>
              <div className="gen-color-row">
                <input
                  type="color"
                  name="primary_color"
                  value={formData.primary_color}
                  onChange={handleInputChange}
                  disabled={isRunning}
                />
                <span className="gen-color-hex">{formData.primary_color}</span>
              </div>
            </div>
          </section>

          {/* Section 3: Nội dung */}
          <section className="gen-section">
            <h2 className="gen-section-title">
              <span className="gen-section-num">3</span>
              Nội dung nguồn
            </h2>

            <div className="gen-field">
              <label>Nội dung text</label>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                placeholder="Dán nội dung bạn muốn chuyển thành slide..."
                rows={6}
                disabled={isRunning}
              />
            </div>

            <div className="gen-field">
              <label>Hoặc tải PDF</label>
              <label className="gen-file-input">
                <input type="file" accept=".pdf" onChange={handleFileChange} disabled={isRunning} />
                <span>{pdfFile ? `✓ ${pdfFile.name}` : 'Chọn file PDF...'}</span>
              </label>
            </div>
          </section>

          <button type="submit" disabled={isRunning} className="gen-submit">
            {isRunning ? 'Đang xử lý...' : 'Sinh Master Prompt'}
          </button>
        </form>

        {/* ── Result / Status ────────────────────────────── */}
        {(isRunning || jobStatus) && (
          <div ref={resultRef} className="gen-result-area">
            {isRunning && (
              <div className="gen-status-card">
                <div className="gen-spinner"></div>
                <h3>{STATUS_LABELS[status || 'PENDING']}</h3>
                <p className="gen-status-hint">Quá trình có thể mất 30-60 giây.</p>
              </div>
            )}

            {status === 'FAILED' && (
              <div className="gen-error-card">
                <h3>⚠ Tạo prompt thất bại</h3>
                <p>{jobStatus?.error_message || 'Có lỗi xảy ra. Vui lòng thử lại.'}</p>
                <button onClick={handleReset} className="gen-btn-secondary">Thử lại</button>
              </div>
            )}

            {status === 'COMPLETED' && jobStatus?.result && (
              <div className="gen-result-card">
                <div className="gen-result-header">
                  <div>
                    <h3>Master Prompt đã sẵn sàng</h3>
                    <p className="gen-result-meta">
                      {jobStatus.result.total_slides} slide · {formData.language === 'vi' ? 'Tiếng Việt' : 'English'}
                    </p>
                  </div>
                  <button onClick={handleCopy} className={`gen-copy-btn ${copied ? 'copied' : ''}`}>
                    {copied ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Đã copy
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M3 11V3a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <pre className="gen-prompt-output">{jobStatus.result.full_master_prompt}</pre>

                <div className="gen-result-footer">
                  <p className="gen-result-hint">
                    Dán prompt này vào ChatGPT, Claude, hoặc Gemini để tạo slide PowerPoint hoàn chỉnh.
                  </p>
                  <button onClick={handleReset} className="gen-btn-secondary">Tạo prompt mới</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}