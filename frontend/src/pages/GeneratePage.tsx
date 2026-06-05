import { useState, useEffect, ChangeEvent, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { promptAPI, DesignDescription, draftAPI, SaveDraftPayload, JobStatusResponse } from '../services/api'
import './GeneratePage.css'

// Phải khớp với backend
const STYLE_OPTIONS = [
  {
    value: 'minimalist',
    label: 'Minimalist',
    icon: '◇',
    desc: 'Ít chữ, nhiều khoảng trống, sạch và dễ đọc.',
  },
  {
    value: 'modern',
    label: 'Modern',
    icon: '✦',
    desc: 'Hiện đại, cân bằng giữa chuyên nghiệp và nổi bật.',
  },
  {
    value: 'storytelling',
    label: 'Storytelling',
    icon: '⌁',
    desc: 'Dẫn dắt theo câu chuyện, phù hợp thuyết trình truyền cảm hứng.',
  },
  {
    value: 'academic',
    label: 'Academic',
    icon: '▤',
    desc: 'Rõ ràng, logic, phù hợp bài học hoặc báo cáo học thuật.',
  },
  {
    value: 'corporate',
    label: 'Corporate',
    icon: '▣',
    desc: 'Trang trọng, gọn, phù hợp báo cáo công việc và doanh nghiệp.',
  },
  {
    value: 'creative',
    label: 'Creative',
    icon: '✺',
    desc: 'Nhiều hình ảnh, màu sắc, phù hợp ý tưởng và chiến dịch.',
  },
  {
    value: 'technical',
    label: 'Technical',
    icon: '⌬',
    desc: 'Tập trung hệ thống, quy trình, số liệu và kiến trúc.',
  },
]

const LAYOUT_OPTIONS = [
  {
    value: 'key_message',
    label: 'Key Message',
    icon: '▰',
    desc: 'Mỗi slide có một thông điệp chính thật rõ.',
  },
  {
    value: 'split',
    label: 'Split',
    icon: '◧',
    desc: 'Chia 2 cột: nội dung và hình ảnh / biểu đồ.',
  },
  {
    value: 'gridcards',
    label: 'Grid Cards',
    icon: '▦',
    desc: 'Nhiều ý nhỏ trình bày dạng card gọn gàng.',
  },
  {
    value: 'timeline',
    label: 'Timeline',
    icon: '━━',
    desc: 'Phù hợp tiến trình, lịch sử, roadmap, quy trình.',
  },
  {
    value: 'bigstat_impact',
    label: 'Big Stat',
    icon: '99',
    desc: 'Nhấn mạnh số liệu lớn, KPI hoặc insight quan trọng.',
  },
  {
    value: 'full_image_text_overlay',
    label: 'Image Overlay',
    icon: '◩',
    desc: 'Ảnh lớn làm nền, chữ phủ lên tạo cảm giác cinematic.',
  },
]

const COLOR_PRESETS = [
  { name: 'Cyber Pink', value: '#d946ef' },
  { name: 'Neon Blue', value: '#22d3ee' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Amber', value: '#facc15' },
]

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chuẩn bị...',
  PROCESSING: 'AI đang phân tích nội dung và tạo cấu trúc slide...',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Đã có lỗi xảy ra',
}

// Labels + hints cho 5 trường DesignDescription
const DESC_LABELS: Record<keyof DesignDescription, string> = {
  tone: 'Giọng điệu',
  font: 'Font chữ',
  key_message_rule: 'Quy tắc thông điệp chính',
  density: 'Mật độ thông tin',
  visual: 'Hướng dẫn hình ảnh',
}

const DESC_HINTS: Record<keyof DesignDescription, string> = {
  tone: 'Phong cách ngôn ngữ, cảm xúc của bài trình bày',
  font: 'Kiểu chữ đề xuất cho tiêu đề và nội dung',
  key_message_rule: 'Quy tắc xây dựng thông điệp chính mỗi slide',
  density: 'Lượng thông tin trên mỗi slide',
  visual: 'Loại hình ảnh, icon, biểu đồ phù hợp',
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

  const [pdfFile, setPdfFile] = useState<File | null>(null)

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

    updateFormField(
      name as keyof typeof formData,
      name === 'slide_count' ? parseInt(value) : value
    )
  }

  const updateFormField = (name: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))

    if (['purpose', 'audience', 'style', 'primary_layout', 'primary_color', 'language'].includes(name)) {
      setDescription(null)
      setDescError('')
    }
  }

const resizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return

  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

const handleDescriptionChange =
  (field: keyof DesignDescription) => (e: ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextarea(e.currentTarget)
    setDescription(prev => (prev ? { ...prev, [field]: e.target.value } : null))
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPdfFile(e.target.files?.[0] || null)
  }

  const handleSaveDraft = async () => {
    setDraftMessage('')
    if (formData.purpose.trim().length < 3 || formData.audience.trim().length < 3) {
      setDraftMessage('Cần nhập mục đích và đối tượng trước khi lưu Draft')
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
        setDraftMessage('Đã cập nhật nháp')
      } else {
        const res = await draftAPI.saveDraft(payload)
        setCurrentDraftId(res.data.id)
        setDraftMessage('Đã lưu nháp')
      }
    } catch (err: any) {
      setDraftMessage(err.response?.data?.detail || 'Lưu nháp thất bại')
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

    if (!formData.content.trim() && !pdfFile) {
      setSubmitError('Vui lòng cung cấp ít nhất một trong hai: nội dung văn bản hoặc file PDF.')
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
          <button
            type="button"
            className="gen-brand gen-brand-link"
            onClick={() => navigate('/')}
          >
            <div className="gen-logo">PB</div>
            <span className="gen-brand-name">Slide Prompt Builder</span>
          </button>

          <div className="gen-user" onClick={() => setShowUserMenu(v => !v)}>
            <div className="gen-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
            <span className="gen-user-email">{user?.email}</span>

            <svg
              className={`gen-chevron ${showUserMenu ? 'open' : ''}`}
              width="12"
              height="12"
              viewBox="0 0 12 12"
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {showUserMenu && (
              <div className="gen-user-menu" onClick={e => e.stopPropagation()}>
                <button type="button" onClick={() => navigate('/')}>
                  Trang chủ
                </button>

                <button type="button" onClick={() => navigate('/history')}>
                  Lịch sử Prompt
                </button>

                <button type="button" className="danger" onClick={handleLogout}>
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────── */}
      <main className="gen-main">
        <section className="gen-builder-hero">
          <div className="gen-kicker">
            <span className="gen-kicker-dot" />
            AI Presentation Prompt Console
          </div>

          <h1>
            Build your{' '}
            <span className="gen-gradient-pink">Master Prompt</span>
            <br />
            for stunning slides.
          </h1>

          <p>
            Điền brief, chọn vibe thiết kế, để AI phân tích hướng trình bày rồi sinh
            một Master Prompt hoàn chỉnh cho PowerPoint, Marp hoặc slide deck.
          </p>

          <div className="gen-stepper">
            <div className={`gen-step ${formData.purpose && formData.audience ? 'done' : 'active'}`}>
              <span>1</span>
              <strong>Brief</strong>
            </div>
            <div className={`gen-step ${description ? 'done' : formData.purpose && formData.audience ? 'active' : ''}`}>
              <span>2</span>
              <strong>AI Design</strong>
            </div>
            <div className={`gen-step ${description ? 'active' : ''}`}>
              <span>3</span>
              <strong>Content</strong>
            </div>
            <div className={`gen-step ${status === 'COMPLETED' ? 'done active' : ''}`}>
              <span>4</span>
              <strong>Result</strong>
            </div>
          </div>
        </section>

        {/* Builder Console */}
        <div className="gen-form gen-console">
          <div className="gen-console-topbar">
            <div className="gen-window-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="gen-console-title">builder.config.tsx</span>

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
          </div>

          <section className="gen-section">
            <div className="gen-section-heading">
              <h2 className="gen-section-title">
                <span className="gen-section-num">1</span>
                Project Brief
              </h2>
              <p>Nói cho AI biết bài thuyết trình dùng để làm gì và người xem là ai.</p>
            </div>

            <div className="gen-field-grid">
              <div className="gen-field">
                <label>Mục đích</label>
                <input
                  type="text"
                  name="purpose"
                  value={formData.purpose}
                  onChange={handleInputChange}
                  placeholder="Vd: Báo cáo doanh số Q1"
                  minLength={3}
                  disabled={isFormLocked}
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
                  minLength={3}
                  disabled={isFormLocked}
                />
              </div>
            </div>
          </section>

          <section className="gen-section">
            <div className="gen-section-heading">
              <h2 className="gen-section-title">
                <span className="gen-section-num">2</span>
                Visual Direction
              </h2>
              <p>Chọn phong cách, layout, số slide và màu chủ đạo cho slide deck.</p>
            </div>

            <div className="gen-subsection">
              <div className="gen-subsection-title">
                <span>01</span>
                <strong>Phong cách</strong>
              </div>

              <div className="gen-option-grid gen-option-grid-style">
                {STYLE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isFormLocked}
                    onClick={() => updateFormField('style', option.value)}
                    className={`gen-option-card ${formData.style === option.value ? 'active' : ''}`}
                  >
                    <span className="gen-option-icon">{option.icon}</span>
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="gen-subsection">
              <div className="gen-subsection-title">
                <span>02</span>
                <strong>Bố cục chính</strong>
              </div>

              <div className="gen-option-grid gen-option-grid-layout">
                {LAYOUT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isFormLocked}
                    onClick={() => updateFormField('primary_layout', option.value)}
                    className={`gen-option-card gen-layout-card ${formData.primary_layout === option.value ? 'active' : ''}`}
                  >
                    <span className="gen-option-icon">{option.icon}</span>
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="gen-control-grid">
              <div className="gen-field">
                <label>Số slide</label>
                <div className="gen-slide-pills">
                  {[5, 7, 10, 15].map(count => (
                    <button
                      key={count}
                      type="button"
                      disabled={isFormLocked}
                      onClick={() => updateFormField('slide_count', count)}
                      className={formData.slide_count === count ? 'active' : ''}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  name="slide_count"
                  value={formData.slide_count}
                  onChange={handleInputChange}
                  min="3"
                  max="30"
                  disabled={isFormLocked}
                />
              </div>

              <div className="gen-field">
                <label>Ngôn ngữ</label>
                <div className="gen-language-toggle">
                  <button
                    type="button"
                    disabled={isFormLocked}
                    onClick={() => updateFormField('language', 'vi')}
                    className={formData.language === 'vi' ? 'active' : ''}
                  >
                    Tiếng Việt
                  </button>
                  <button
                    type="button"
                    disabled={isFormLocked}
                    onClick={() => updateFormField('language', 'en')}
                    className={formData.language === 'en' ? 'active' : ''}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="gen-field gen-field-color">
                <label>Màu chủ đạo</label>
                <div className="gen-color-presets">
                  {COLOR_PRESETS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      disabled={isFormLocked}
                      title={color.name}
                      onClick={() => updateFormField('primary_color', color.value)}
                      className={formData.primary_color === color.value ? 'active' : ''}
                      style={{ '--preset-color': color.value } as React.CSSProperties}
                    />
                  ))}
                </div>

                <div className="gen-color-row">
                  <input
                    type="color"
                    name="primary_color"
                    value={formData.primary_color}
                    onChange={handleInputChange}
                    disabled={isFormLocked}
                  />
                  <span className="gen-color-hex">{formData.primary_color}</span>
                </div>
              </div>
            </div>
          </section>

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
                  <>
                    <span className="gen-btn-spinner" />
                    Đang phân tích thiết kế...
                  </>
                ) : (
                  <>✦ Analyze Design Direction</>
                )}
              </button>

              <p className="gen-phase1-hint">
                AI sẽ gợi ý tone, font, mật độ nội dung và hướng hình ảnh trước khi sinh Master Prompt.
              </p>
            </div>
          )}

          {description && !isRunning && (
            <div className="gen-reanalyze-row">
              <button
                type="button"
                className="gen-reanalyze-btn"
                onClick={() => {
                  setDescription(null)
                  setDescError('')
                }}
              >
                ↩ Thay đổi thiết kế
              </button>
            </div>
          )}
        </div>

        {description && (
          <div ref={descRef} className="gen-desc-panel">
            <div className="gen-desc-header">
              <span className="gen-desc-badge">✦ AI Design Direction</span>
              <p className="gen-desc-subtitle">
                Đây là brief thiết kế AI đề xuất. Bạn có thể chỉnh trực tiếp trước khi sinh Master Prompt.
              </p>
            </div>

            <div className="gen-desc-fields">
              {(Object.keys(DESC_LABELS) as Array<keyof DesignDescription>).map(field => (
                <div key={field} className="gen-desc-field">
                  <label>
                    {DESC_LABELS[field]}
                    <span className="gen-desc-hint">{DESC_HINTS[field]}</span>
                  </label>
                  <textarea
                    className={`gen-desc-textarea gen-desc-textarea-${field}`}
                    value={description[field]}
                    onChange={handleDescriptionChange(field)}
                    rows={3}
                    disabled={isRunning}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {description && (
          <form onSubmit={handleSubmit} className="gen-form gen-content-form">
            <div className="gen-console-topbar">
              <div className="gen-window-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="gen-console-title">content.input</span>
            </div>

            <section className="gen-section">
              <div className="gen-section-heading">
                <h2 className="gen-section-title">
                  <span className="gen-section-num">3</span>
                  Source Content
                </h2>
                <p>Dán nội dung hoặc tải PDF. Backend vẫn nhận đúng `content` hoặc `pdf_file` như cũ.</p>
              </div>

              <div className="gen-field">
                <label>Nội dung text</label>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  placeholder="Dán nội dung bạn muốn chuyển thành slide..."
                  rows={8}
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

            {submitError && (
              <div className="gen-submit-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{submitError}</span>
              </div>
            )}

            <button type="submit" disabled={isRunning} className="gen-submit">
              {isRunning ? 'Đang xử lý...' : '🚀 Generate Master Prompt'}
            </button>
          </form>
        )}

        {(isRunning || jobStatus) && (
          <div ref={resultRef} className="gen-result-area">
            {isRunning && (
              <div className="gen-status-card">
                <div className="gen-spinner" />
                <h3>{STATUS_LABELS[status || 'PENDING']}</h3>
                <p className="gen-status-hint">AI đang dựng cấu trúc slide và assemble Master Prompt.</p>
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
                    {copied ? '✓ Đã copy' : 'Copy Prompt'}
                  </button>
                </div>

                <pre className="gen-prompt-output">{jobStatus.result.full_master_prompt}</pre>

                <div className="gen-result-footer">
                  <p className="gen-result-hint">
                    Dán prompt này vào ChatGPT, Claude hoặc Gemini để tạo slide PowerPoint hoàn chỉnh.
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
