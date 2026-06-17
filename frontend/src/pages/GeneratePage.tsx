import { useState, useEffect, ChangeEvent, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { promptAPI, DesignDescription, draftAPI, SaveDraftPayload, JobStatusResponse } from '../services/api'
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

// Labels + hints cho 5 trường text của DesignDescription (color_palette có UI riêng)
type DescTextField = Exclude<keyof DesignDescription, 'color_palette'>

const DESC_LABELS: Record<DescTextField, string> = {
  tone: 'Giọng điệu',
  font: 'Font chữ',
  key_message_rule: 'Quy tắc thông điệp chính',
  density: 'Mật độ thông tin',
  visual: 'Hướng dẫn hình ảnh',
}

const DESC_HINTS: Record<DescTextField, string> = {
  tone: 'Phong cách ngôn ngữ, cảm xúc của bài trình bày',
  font: 'Kiểu chữ đề xuất cho tiêu đề và nội dung',
  key_message_rule: 'Quy tắc xây dựng thông điệp chính mỗi slide',
  density: 'Lượng thông tin trên mỗi slide',
  visual: 'Visual hierarchy (yếu tố nổi bật), loại hình ảnh/icon/biểu đồ, và cách bố trí không gian',
}

export function GeneratePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Form data
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

  const [files, setFiles] = useState<File[]>([])

  // Phase 1 state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [description, setDescription] = useState<DesignDescription | null>(null)
  const [descError, setDescError] = useState('')

  // Phase 2 state
  const [isGenerating, setIsGenerating] = useState(false)
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftMessage, setDraftMessage] = useState('')

  // UI state
  const [copied, setCopied] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const descRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  useEffect(() => {
    const draft = (location.state as { draft?: SaveDraftPayload & { draftId?: string } } | null)?.draft
    if (!draft) return

    setFormData({
      purpose: draft.purpose,
      audience: draft.audience,
      style: draft.style,
      primary_color: draft.primary_color,
      slide_count: draft.slide_count,
      primary_layout: draft.primary_layout,
      content: draft.content,
      language: draft.language,
    })
    setDescription((draft.description as DesignDescription | null) || null)
    setCurrentDraftId(draft.draftId || null)
    setDraftMessage('Da tai ban nhap')
    window.history.replaceState({}, '', '/generate')
  }, [location.state])

  // Tự scroll xuống description panel khi Phase 1 xong
  useEffect(() => {
    if (description && descRef.current) {
      setTimeout(() => descRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [description])

  // Poll job status mỗi 2s
  useEffect(() => {
    if (!jobId || !isPolling) return
    const checkStatus = async () => {
      try {
        const response = await promptAPI.getJobStatus(jobId)
        setJobStatus(response.data)
        if (response.data.status === 'COMPLETED' || response.data.status === 'FAILED') {
          setIsPolling(false)
        }
      } catch (err: any) {
        setJobStatus({
          job_id: jobId,
          status: 'FAILED',
          result: null,
          error_message: err.response?.data?.detail || 'Khong the lay trang thai job',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        setIsPolling(false)
      }
    }
    checkStatus()
    const timer = setInterval(checkStatus, 2000)
    return () => clearInterval(timer)
  }, [jobId, isPolling])

  // Tự scroll xuống result khi COMPLETED
  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED' && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [jobStatus?.status])

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'slide_count' ? parseInt(value) : value,
    }))
    // Nếu user thay đổi field ảnh hưởng đến Phase 1 → reset description
    if (['purpose', 'audience', 'style', 'primary_layout', 'primary_color', 'language'].includes(name)) {
      setDescription(null)
      setDescError('')
    }
  }

  const handleDescriptionChange =
    (field: DescTextField) => (e: ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(prev => (prev ? { ...prev, [field]: e.target.value } : null))
    }

  const handlePaletteColorChange =
    (field: 'secondary' | 'accent') => (e: ChangeEvent<HTMLInputElement>) => {
      setDescription(prev =>
        prev ? { ...prev, color_palette: { ...prev.color_palette, [field]: e.target.value } } : null
      )
    }

  const handlePaletteNeutralChange =
    (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
      setDescription(prev => {
        if (!prev) return null
        const neutrals = [...prev.color_palette.neutrals]
        neutrals[index] = e.target.value
        return { ...prev, color_palette: { ...prev.color_palette, neutrals } }
      })
    }

  const handlePaletteDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(prev =>
      prev ? { ...prev, color_palette: { ...prev.color_palette, description: e.target.value } } : null
    )
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveDraft = async () => {
    setDraftMessage('')
    if (formData.purpose.trim().length < 3 || formData.audience.trim().length < 3) {
      setDraftMessage('Can nhap muc dich va doi tuong truoc khi luu nhap')
      return
    }

    setIsDraftSaving(true)
    const payload: SaveDraftPayload = {
      ...formData,
      description: description || null,
    }

    try {
      if (currentDraftId) {
        await draftAPI.updateDraft(currentDraftId, payload)
        setDraftMessage('Da cap nhat nhap')
      } else {
        const res = await draftAPI.saveDraft(payload)
        setCurrentDraftId(res.data.id)
        setDraftMessage('Da luu nhap')
      }
    } catch (err: any) {
      setDraftMessage(err.response?.data?.detail || 'Luu nhap that bai')
    } finally {
      setIsDraftSaving(false)
    }
  }

  // ── PHASE 1: Phân tích thiết kế ──────────────────────────────────
  const handleAnalyze = async () => {
    if (!formData.purpose.trim() || !formData.audience.trim()) {
      setDescError('Vui lòng điền đầy đủ Mục đích và Đối tượng.')
      return
    }
    setDescError('')
    setIsAnalyzing(true)
    setDescription(null)

    try {
      const res = await promptAPI.generateDescription({
        purpose: formData.purpose,
        audience: formData.audience,
        style: formData.style,
        primary_layout: formData.primary_layout,
        primary_color: formData.primary_color,
        language: formData.language,
      })
      setDescription(res.data)
    } catch (err: any) {
      setDescError(err.response?.data?.detail || 'Lỗi khi phân tích thiết kế. Vui lòng thử lại.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── PHASE 2: Sinh Master Prompt ───────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    if (!formData.content.trim() && files.length === 0) {
      setSubmitError('Vui lòng cung cấp ít nhất một trong hai: nội dung văn bản hoặc tải file.')
      return
    }

    setIsGenerating(true)
    setJobId(null)
    setJobStatus(null)
    setCopied(false)

    try {
      const response = await promptAPI.generate({
        ...formData,
        files: files.length > 0 ? files : undefined,
        description: description || undefined,
      })
      setJobId(response.data.job_id)
      setIsPolling(true)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setSubmitError(detail || 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    const text = jobStatus?.result?.full_master_prompt
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
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
    setDescription(null)
    setDescError('')
    setSubmitError('')
  }

  const status = jobStatus?.status
  const isRunning = isGenerating || status === 'PENDING' || status === 'PROCESSING'
  const isFormLocked = isAnalyzing || isRunning

  return (
    <div className="gen-page">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="gen-header">
        <div className="gen-header-inner">
          <div className="gen-brand">
            <div className="gen-logo">PB</div>
            <span className="gen-brand-name">Prompt Builder</span>
          </div>

          <div className="gen-user" onClick={() => setShowUserMenu(v => !v)}>
            <div className="gen-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
            <span className="gen-user-email">{user?.email}</span>
            <svg
              className={`gen-chevron ${showUserMenu ? 'open' : ''}`}
              width="12" height="12" viewBox="0 0 12 12"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showUserMenu && (
              <div className="gen-user-menu" onClick={e => e.stopPropagation()}>
                <button onClick={() => navigate('/history')}>Lịch sử Prompt</button>
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
            Điền thông tin về bài thuyết trình. AI sẽ gợi ý thiết kế để bạn xem
            và chỉnh, sau đó sinh Master Prompt để copy vào ChatGPT, Claude hoặc Gemini.
          </p>
        </div>

        {/* ── Bước 1 & 2: Form thông tin cơ bản ─────────── */}
        <div className="gen-form">
          <div className="gen-form-toolbar">
            {draftMessage && <span className="gen-draft-message">{draftMessage}</span>}
            <button
              type="button"
              className="gen-draft-btn"
              onClick={handleSaveDraft}
              disabled={isDraftSaving || isFormLocked}
            >
              {isDraftSaving ? 'Đang lưu...' : currentDraftId ? 'Cập nhật Draft' : 'Lưu Draft'}
            </button>
          </div>

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
                  type="text" name="purpose" value={formData.purpose}
                  onChange={handleInputChange}
                  placeholder="Vd: Báo cáo doanh số Q1"
                  minLength={3} disabled={isFormLocked}
                />
              </div>
              <div className="gen-field">
                <label>Đối tượng</label>
                <input
                  type="text" name="audience" value={formData.audience}
                  onChange={handleInputChange}
                  placeholder="Vd: Ban lãnh đạo công ty"
                  minLength={3} disabled={isFormLocked}
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
                <select name="style" value={formData.style} onChange={handleInputChange} disabled={isFormLocked}>
                  {STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="gen-field">
                <label>Bố cục chính</label>
                <select name="primary_layout" value={formData.primary_layout} onChange={handleInputChange} disabled={isFormLocked}>
                  {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="gen-field">
                <label>Số slide</label>
                <input
                  type="number" name="slide_count" value={formData.slide_count}
                  onChange={handleInputChange} min="3" max="30" disabled={isFormLocked}
                />
              </div>
              <div className="gen-field">
                <label>Ngôn ngữ</label>
                <select name="language" value={formData.language} onChange={handleInputChange} disabled={isFormLocked}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <div className="gen-field gen-field-color">
              <label>Màu chủ đạo</label>
              <div className="gen-color-row">
                <input type="color" name="primary_color" value={formData.primary_color}
                  onChange={handleInputChange} disabled={isFormLocked} />
                <span className="gen-color-hex">{formData.primary_color}</span>
              </div>
            </div>
          </section>

          {/* ── Nút Phase 1 (hiện khi chưa có description) ── */}
          {!description && (
            <div className="gen-phase1-footer">
              {descError && <p className="gen-desc-error">{descError}</p>}
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isFormLocked || formData.purpose.trim().length < 3 || formData.audience.trim().length < 3}
                className="gen-analyze-btn"
              >
                {isAnalyzing ? (
                  <><span className="gen-btn-spinner" />Đang phân tích thiết kế...</>
                ) : (
                  <>✦ Phân tích thiết kế</>
                )}
              </button>
              <p className="gen-phase1-hint">
                AI sẽ gợi ý tone, font và phong cách dựa trên thông tin bạn nhập (~3–5 giây)
              </p>
            </div>
          )}

          {/* ── Nút "Phân tích lại" khi đã có description ── */}
          {description && !isRunning && (
            <div className="gen-reanalyze-row">
              <button
                type="button"
                className="gen-reanalyze-btn"
                onClick={() => { setDescription(null); setDescError('') }}
              >
                ↩ Thay đổi thiết kế
              </button>
            </div>
          )}
        </div>

        {/* ── Bước 3: Kết quả Phase 1 — Design Description ─ */}
        {description && (
          <div ref={descRef} className="gen-desc-panel">
            <div className="gen-desc-header">
              <span className="gen-desc-badge">✦ Gợi ý thiết kế từ AI</span>
              <p className="gen-desc-subtitle">
                Chỉnh sửa các ô bên dưới nếu muốn, rồi điền nội dung và nhấn{' '}
                <strong>Sinh Master Prompt</strong>.
              </p>
            </div>

            <div className="gen-palette-section">
              <h3 className="gen-palette-title">Bảng màu</h3>
              <div className="gen-palette-swatches">
                <div className="gen-field gen-field-color">
                  <label>
                    Primary
                    <span className="gen-desc-hint">theo Màu chủ đạo ở Bước 2</span>
                  </label>
                  <div className="gen-color-row">
                    <input type="color" value={description.color_palette.primary} disabled />
                    <span className="gen-color-hex">{description.color_palette.primary}</span>
                  </div>
                </div>
                <div className="gen-field gen-field-color">
                  <label>Secondary</label>
                  <div className="gen-color-row">
                    <input
                      type="color"
                      value={description.color_palette.secondary}
                      onChange={handlePaletteColorChange('secondary')}
                      disabled={isRunning}
                    />
                    <span className="gen-color-hex">{description.color_palette.secondary}</span>
                  </div>
                </div>
                <div className="gen-field gen-field-color">
                  <label>Accent</label>
                  <div className="gen-color-row">
                    <input
                      type="color"
                      value={description.color_palette.accent}
                      onChange={handlePaletteColorChange('accent')}
                      disabled={isRunning}
                    />
                    <span className="gen-color-hex">{description.color_palette.accent}</span>
                  </div>
                </div>
                {description.color_palette.neutrals.map((hex, i) => (
                  <div key={i} className="gen-field gen-field-color">
                    <label>{`Neutral ${i + 1}`}</label>
                    <div className="gen-color-row">
                      <input
                        type="color"
                        value={hex}
                        onChange={handlePaletteNeutralChange(i)}
                        disabled={isRunning}
                      />
                      <span className="gen-color-hex">{hex}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="gen-desc-field gen-palette-description">
                <label>Mô tả & quy tắc phối màu</label>
                <textarea
                  value={description.color_palette.description}
                  onChange={handlePaletteDescriptionChange}
                  rows={3}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className="gen-desc-fields">
              {(Object.keys(DESC_LABELS) as Array<DescTextField>).map(field => (
                <div key={field} className="gen-desc-field">
                  <label>
                    {DESC_LABELS[field]}
                    <span className="gen-desc-hint">{DESC_HINTS[field]}</span>
                  </label>
                  <textarea
                    value={description[field]}
                    onChange={handleDescriptionChange(field)}
                    rows={2}
                    disabled={isRunning}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bước 4: Nội dung nguồn + Nút Phase 2 ─────────── */}
        {description && (
          <form onSubmit={handleSubmit} className="gen-form gen-content-form">
            <section className="gen-section">
              <h2 className="gen-section-title">
                <span className="gen-section-num">3</span>
                Nội dung nguồn
              </h2>
              <div className="gen-field">
                <label>Nội dung text</label>
                <textarea
                  name="content" value={formData.content} onChange={handleInputChange}
                  placeholder="Dán nội dung bạn muốn chuyển thành slide..."
                  rows={6} disabled={isRunning}
                />
              </div>
              <div className="gen-field">
                <label>Hoặc tải file (PDF, JPG, PNG)</label>
                <label className="gen-file-input">
                  <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" multiple onChange={handleFileChange} disabled={isRunning} />
                  <span>Chọn file...</span>
                </label>
                {files.length > 0 && (
                  <ul className="gen-file-list">
                    {files.map((file, idx) => (
                      <li key={idx}>
                        <span className="gen-file-name">{file.name}</span>
                        <button type="button" className="gen-file-remove" onClick={() => handleRemoveFile(idx)} disabled={isRunning}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {submitError && (
              <div className="gen-submit-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" />
                </svg>
                <span>{submitError}</span>
              </div>
            )}

            <button type="submit" disabled={isRunning} className="gen-submit">
              {isRunning ? 'Đang xử lý...' : '🚀 Sinh Master Prompt'}
            </button>
          </form>
        )}

        {/* ── Kết quả / Trạng thái ───────────────────────── */}
        {(isRunning || jobStatus) && (
          <div ref={resultRef} className="gen-result-area">
            {isRunning && (
              <div className="gen-status-card">
                <div className="gen-spinner" />
                <h3>{STATUS_LABELS[status || 'PENDING']}</h3>
                <p className="gen-status-hint">Quá trình có thể mất 30–60 giây.</p>
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
                          <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
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
