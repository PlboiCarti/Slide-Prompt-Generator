/**
 * GeneratePage — Trang tạo Master Prompt (hai phase)
 *
 * Luồng chính:
 *   Phase 1 — Người dùng điền brief (mục đích, đối tượng, style, layout, màu sắc).
 *             Nhấn "Phân tích Định hướng Thiết kế" → POST /api/generate-description (~3–5s).
 *             Backend trả về DesignDescription (tone, font, density...) để người dùng xem/sửa.
 *
 *   Phase 2 — Người dùng dán nội dung hoặc upload file, nhấn "Tạo Master Prompt"
 *             → POST /api/generate → nhận job_id → frontend polling GET /api/jobs/{id}
 *             mỗi 2s cho đến khi status = COMPLETED hoặc FAILED.
 *
 * Side effects đáng chú ý:
 *   - Auto-save: debounce 3s sau khi purpose/audience thay đổi, lưu ngầm vào draft API.
 *   - Keyboard shortcut: Ctrl/Cmd+Enter trong content textarea kích hoạt submit Phase 2.
 *   - Draft restore: nếu navigate('/generate', { state: { draft } }), toàn bộ form được hydrate.
 *   - Option cards được bọc trong React.memo + useCallback để tránh re-render cascade khi gõ.
 */
import { useState, useEffect, ChangeEvent, useRef, memo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { promptAPI, DesignDescription, Typography, TypographyRole, draftAPI, SaveDraftPayload, JobStatusResponse } from '../services/api'
import { ThemeToggle } from '../components/ThemeToggle'
import './GeneratePage.css'

// ── MODULE-LEVEL CONSTANTS ────────────────────────────────────────────────────

// Sentinel value — dùng để phân biệt lựa chọn "Khác / Tự nhập" với các preset có sẵn.
const CUSTOM_OPTION = '__custom__'

// Các giá trị value phải khớp chính xác với Enum/string mà backend chấp nhận.
const STYLE_OPTIONS = [
  {
    value: 'minimalist',
    label: 'Minimalist',
    icon: '◇',
    desc: 'Ít chữ, nhiều khoảng trống, sạch và dễ đọc.',
    accent: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.25)'
  },
  {
    value: 'modern',
    label: 'Modern',
    icon: '✦',
    desc: 'Hiện đại, cân bằng giữa chuyên nghiệp và nổi bật.',
    accent: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.35)'
  },
  {
    value: 'storytelling',
    label: 'Storytelling',
    icon: '⌁',
    desc: 'Dẫn dắt theo câu chuyện, phù hợp thuyết trình truyền cảm hứng.',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)'
  },
  {
    value: 'academic',
    label: 'Academic',
    icon: '▤',
    desc: 'Rõ ràng, logic, phù hợp bài học hoặc báo cáo học thuật.',
    accent: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.35)'
  },
  {
    value: 'corporate',
    label: 'Corporate',
    icon: '▣',
    desc: 'Trang trọng, gọn, phù hợp báo cáo công việc và doanh nghiệp.',
    accent: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.35)'
  },
  {
    value: 'creative',
    label: 'Creative',
    icon: '✺',
    desc: 'Nhiều hình ảnh, màu sắc, phù hợp ý tưởng và chiến dịch.',
    accent: '#eab308',
    glow: 'rgba(234, 179, 8, 0.35)'
  },
  {
    value: 'technical',
    label: 'Technical',
    icon: '⌬',
    desc: 'Tập trung hệ thống, quy trình, số liệu và kiến trúc.',
    accent: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.35)'
  },
  {
    value: 'elegant',
    label: 'Elegant',
    icon: '◆',
    desc: 'Sang trọng, tinh tế, phù hợp sự kiện cao cấp hoặc thương hiệu.',
    accent: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.35)'
  },
  {
    value: CUSTOM_OPTION,
    label: 'Khác',
    icon: '✎',
    desc: 'Tự nhập phong cách thiết kế riêng của bạn.',
    accent: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.35)'
  },
]

const LAYOUT_OPTIONS = [
  {
    value: 'key_message',
    label: 'Key Message',
    icon: '▰',
    desc: 'Mỗi slide có một thông điệp chính thật rõ.',
    accent: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.3)',
  },
  {
    value: 'split',
    label: 'Split',
    icon: '◧',
    desc: 'Chia 2 cột: nội dung và hình ảnh / biểu đồ.',
    accent: '#7c3aed',
    glow: 'rgba(124, 58, 237, 0.3)',
  },
  {
    value: 'gridcards',
    label: 'Grid Cards',
    icon: '▦',
    desc: 'Nhiều ý nhỏ trình bày dạng card gọn gàng.',
    accent: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.3)',
  },
  {
    value: 'timeline',
    label: 'Timeline',
    icon: '━━',
    desc: 'Phù hợp tiến trình, lịch sử, roadmap, quy trình.',
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.3)',
  },
  {
    value: 'bigstat_impact',
    label: 'Big Stat',
    icon: '99',
    desc: 'Nhấn mạnh số liệu lớn, KPI hoặc insight quan trọng.',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.3)',
  },
  {
    value: 'full_image_text_overlay',
    label: 'Image Overlay',
    icon: '◩',
    desc: 'Ảnh lớn làm nền, chữ phủ lên tạo cảm giác cinematic.',
    accent: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
  {
    value: 'comparison',
    label: 'Comparison',
    icon: '⇄',
    desc: 'So sánh 2 lựa chọn, phương án hoặc trước/sau.',
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.3)',
  },
  {
    value: 'process_flow',
    label: 'Process Flow',
    icon: '➜',
    desc: 'Các bước quy trình nối tiếp theo thứ tự hoặc mũi tên.',
    accent: '#f97316',
    glow: 'rgba(249, 115, 22, 0.3)',
  },
  {
    value: CUSTOM_OPTION,
    label: 'Khác',
    icon: '✎',
    desc: 'Tự nhập bố cục slide riêng của bạn.',
    accent: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.3)',
  },
]

const SLIDE_MIN = 6
const SLIDE_MAX = 30
const SLIDE_PRESETS = [8, 10, 15, 20]

const COLOR_PRESETS = [
  { name: 'Hồng Tím', value: '#d946ef' },
  { name: 'Xanh Dương', value: '#2563eb' },
  { name: 'Xanh Ngọc', value: '#22d3ee' },
  { name: 'Tím', value: '#7c3aed' },
  { name: 'Xanh Lá', value: '#22c55e' },
]

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chuẩn bị...',
  PROCESSING: 'AI đang phân tích nội dung và tạo cấu trúc slide...',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Đã có lỗi xảy ra',
}

// Labels + hints cho 4 trường text của DesignDescription (color_palette và typography có UI riêng)
type DescTextField = Exclude<keyof DesignDescription, 'color_palette' | 'typography'>

const DESC_LABELS: Record<DescTextField, string> = {
  tone: 'Giọng điệu',
  key_message_rule: 'Quy tắc thông điệp chính',
  density: 'Mật độ thông tin',
  visual: 'Hướng dẫn hình ảnh',
}

const DESC_HINTS: Record<DescTextField, string> = {
  tone: 'Phong cách ngôn ngữ, cảm xúc của bài trình bày',
  key_message_rule: 'Quy tắc xây dựng thông điệp chính mỗi slide',
  density: 'Lượng thông tin trên mỗi slide',
  visual: 'Visual hierarchy (yếu tố nổi bật), loại hình ảnh/icon/biểu đồ, và cách bố trí không gian',
}

const DESC_ICONS: Record<DescTextField, string> = {
  tone: '◎',
  key_message_rule: '⚡',
  density: '◈',
  visual: '◧',
}

const TYPO_ROLE_LABELS: Record<keyof Pick<Typography, 'title' | 'eyebrow' | 'body' | 'supporting'>, string> = {
  title: 'Tiêu đề slide',
  eyebrow: 'Eyebrow / Kicker',
  body: 'Thân bài (Body)',
  supporting: 'Hỗ trợ (Italic)',
}

// ── UI RENDER HELPERS ─────────────────────────────────────────────────────────

/**
 * GenDeckVisual — Miniature SVG-less slide preview.
 * Render layout preview dạng thu nhỏ bằng CSS thuần, không có ảnh thật.
 * Được dùng trong layout preview panel với React key={layout} để buộc remount
 * và kích hoạt lại animation gdeck-enter mỗi lần layout thay đổi.
 */
function GenDeckVisual({ type }: { type: string }) {
  switch (type) {
    case 'key_message':
      return (
        <div className="gdeck gdeck--key-message">
          <span className="gdeck-bar gdeck-bar--accent" />
          <span className="gdeck-bar gdeck-bar--sub" />
          <span className="gdeck-bar gdeck-bar--sub gdeck-bar--xs" />
        </div>
      )
    case 'split':
      return (
        <div className="gdeck gdeck--split">
          <div className="gdeck-col gdeck-col--text">
            <span className="gdeck-line" />
            <span className="gdeck-line" />
            <span className="gdeck-line gdeck-line--short" />
          </div>
          <div className="gdeck-col gdeck-col--block" />
        </div>
      )
    case 'gridcards':
      return (
        <div className="gdeck gdeck--gridcards">
          {[0, 1, 2, 3].map(i => <span key={i} className="gdeck-cell" />)}
        </div>
      )
    case 'timeline':
      return (
        <div className="gdeck gdeck--timeline">
          <span className="gdeck-track" />
          {[0, 1, 2, 3].map(i => <span key={i} className="gdeck-dot" />)}
        </div>
      )
    case 'bigstat_impact':
      return (
        <div className="gdeck gdeck--bigstat">
          <span className="gdeck-stat">36%</span>
          <span className="gdeck-bar gdeck-bar--sub" />
        </div>
      )
    case 'full_image_text_overlay':
      return (
        <div className="gdeck gdeck--overlay">
          <div className="gdeck-overlay-bg" />
          <div className="gdeck-overlay-content">
            <span className="gdeck-line gdeck-line--light" />
            <span className="gdeck-line gdeck-line--light gdeck-line--short" />
          </div>
        </div>
      )
    case 'comparison':
      return (
        <div className="gdeck gdeck--comparison">
          <div className="gdeck-half gdeck-half--a">
            <span className="gdeck-line" />
            <span className="gdeck-line gdeck-line--short" />
          </div>
          <span className="gdeck-divider" />
          <div className="gdeck-half gdeck-half--b">
            <span className="gdeck-line" />
            <span className="gdeck-line gdeck-line--short" />
          </div>
        </div>
      )
    case 'process_flow':
      return (
        <div className="gdeck gdeck--process">
          <span className="gdeck-step" />
          <span className="gdeck-arrow">→</span>
          <span className="gdeck-step" />
          <span className="gdeck-arrow">→</span>
          <span className="gdeck-step" />
        </div>
      )
    default:
      return (
        <div className="gdeck gdeck--custom">
          <span className="gdeck-custom-glyph">✎</span>
        </div>
      )
  }
}

/**
 * MemoizedOptionCard — Card lựa chọn style/layout được bọc trong React.memo.
 *
 * Lý do memo hóa: GeneratePage re-render mỗi khi formData thay đổi (kể cả khi
 * người dùng đang gõ vào content textarea). Nếu không memo, 18 card (9 style +
 * 9 layout) sẽ re-render đồng loạt sau mỗi keystroke — gây jank rõ rệt.
 *
 * Với memo + stable onSelect (useCallback) + option từ module-level constant,
 * chỉ đúng 2 card thay đổi isActive khi người dùng click chọn card mới.
 */
const MemoizedOptionCard = memo(function OptionCard({
  option,
  isActive,
  disabled,
  cardClass,
  onSelect,
}: {
  option: { value: string; label: string; icon: string; desc: string; accent: string; glow: string }
  isActive: boolean
  disabled: boolean
  cardClass: string
  onSelect: (value: string, isCustom: boolean) => void
}) {
  const isCustomCard = option.value === CUSTOM_OPTION
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(option.value, isCustomCard)}
      className={['gen-option-card', cardClass, isActive ? 'active' : ''].filter(Boolean).join(' ')}
      style={{ '--card-accent': option.accent, '--card-glow': option.glow } as React.CSSProperties}
    >
      <span className="gen-option-icon">{option.icon}</span>
      <strong>{option.label}</strong>
      <small>{option.desc}</small>
    </button>
  )
})

/**
 * StyleCardGrid — Renders all 9 style option cards as a single memoized subtree.
 *
 * Hoist the entire grid outside GeneratePage so React never visits this tree
 * when formData.content / purpose / audience change. With just MemoizedOptionCard,
 * React still allocates 9 JSX descriptors and runs 9 shallow comparisons per
 * keystroke. With this wrapper, the whole subtree is skipped in one check.
 *
 * Props only change when: user picks a different style card, or form locks/unlocks.
 */
const StyleCardGrid = memo(function StyleCardGrid({
  selectedValue,
  isCustom,
  disabled,
  onSelect,
}: {
  selectedValue: string
  isCustom: boolean
  disabled: boolean
  onSelect: (value: string, isCustom: boolean) => void
}) {
  return (
    <div className="gen-option-grid gen-option-grid-style">
      {STYLE_OPTIONS.map(option => (
        <MemoizedOptionCard
          key={option.value}
          option={option}
          isActive={isCustom ? option.value === CUSTOM_OPTION : selectedValue === option.value}
          disabled={disabled}
          cardClass=""
          onSelect={onSelect}
        />
      ))}
    </div>
  )
})

/** LayoutCardGrid — Same isolation pattern for the 9 layout option cards. */
const LayoutCardGrid = memo(function LayoutCardGrid({
  selectedValue,
  isCustom,
  disabled,
  onSelect,
}: {
  selectedValue: string
  isCustom: boolean
  disabled: boolean
  onSelect: (value: string, isCustom: boolean) => void
}) {
  return (
    <div className="gen-option-grid gen-option-grid-layout">
      {LAYOUT_OPTIONS.map(option => (
        <MemoizedOptionCard
          key={option.value}
          option={option}
          isActive={isCustom ? option.value === CUSTOM_OPTION : selectedValue === option.value}
          disabled={disabled}
          cardClass="gen-layout-card"
          onSelect={onSelect}
        />
      ))}
    </div>
  )
})

// ── DESIGN SPEC SUB-COMPONENTS ───────────────────────────────────────────────

/** Single glassmorphic colour swatch tile with an invisible colour-picker overlay. */
const SwatchTile = memo(function SwatchTile({
  label,
  value,
  disabled,
  locked,
  caption,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  locked?: boolean
  caption?: string
  onChange?: (v: string) => void
}) {
  return (
    <div className={`gen-swatch-tile${locked ? ' gen-swatch-tile--locked' : ''}`}>
      <div className="gen-swatch-circle" style={{ background: value }}>
        {!locked && onChange && (
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className="gen-swatch-input"
            aria-label={label}
          />
        )}
      </div>
      <span className="gen-swatch-label">{label}</span>
      <code className="gen-swatch-hex">{value.toUpperCase()}</code>
      {caption && <span className="gen-swatch-desc">{caption}</span>}
    </div>
  )
})

/** Palette section: swatch grid + description box — memo'd so it doesn't
 *  re-render when the user types in the AI Direction textareas. */
const PaletteSwatchGrid = memo(function PaletteSwatchGrid({
  palette,
  isRunning,
  onColorChange,
  onNeutralChange,
  onDescChange,
}: {
  palette: DesignDescription['color_palette']
  isRunning: boolean
  onColorChange: (field: 'secondary' | 'accent', value: string) => void
  onNeutralChange: (index: number, value: string) => void
  onDescChange: (value: string) => void
}) {
  return (
    <div className="gen-palette-section">
      <div className="gen-spec-header">
        <span className="gen-spec-icon">◈</span>
        <h3 className="gen-spec-title">Bảng màu</h3>
      </div>
      <div className="gen-swatch-grid">
        <SwatchTile
          label="Primary" value={palette.primary} disabled locked
          caption="Màu chủ đạo — Chiếm 50-60% diện tích, định hình tone nền chính của slide."
        />
        <SwatchTile
          label="Secondary" value={palette.secondary} disabled={isRunning}
          onChange={v => onColorChange('secondary', v)}
          caption="Màu phụ — Chiếm 15–20% diện tích, dùng cho các khối lớn, menu hoặc shape bổ trợ."
        />
        <SwatchTile
          label="Accent" value={palette.accent} disabled={isRunning}
          onChange={v => onColorChange('accent', v)}
          caption="Màu điểm nhấn — Chiếm 5–10%, dùng cho tiêu đề quan trọng, nút bấm hoặc từ khóa cần thu hút ánh nhìn."
        />
        {palette.neutrals.map((hex, i) => (
          <SwatchTile
            key={i} label={`Neutral ${i + 1}`} value={hex} disabled={isRunning}
            onChange={v => onNeutralChange(i, v)}
            caption="Màu trung tính — Hệ màu bổ túc cho màu chữ, nền phụ và các đường viền chia tách cấu trúc."
          />
        ))}
      </div>
      <div className="gen-palette-desc-box">
        <textarea
          value={palette.description}
          onChange={e => onDescChange(e.target.value)}
          rows={2}
          disabled={isRunning}
          placeholder="Mô tả & quy tắc phối màu..."
          aria-label="Mô tả bảng màu"
        />
      </div>
    </div>
  )
})

/** Single typography role row with live "Aa" colour+weight preview. */
const TypoRoleRow = memo(function TypoRoleRow({
  role,
  label,
  roleData,
  isRunning,
  onChange,
}: {
  role: keyof Pick<Typography, 'title' | 'eyebrow' | 'body' | 'supporting'>
  label: string
  roleData: TypographyRole
  isRunning: boolean
  onChange: (role: keyof Pick<Typography, 'title' | 'eyebrow' | 'body' | 'supporting'>, field: keyof TypographyRole, value: string) => void
}) {
  const w = (roleData.weight ?? '').toLowerCase()
  const previewWeight =
    w.includes('900') || w.includes('black') ? 900
    : w.includes('800') ? 800
    : w.includes('bold') || w.includes('700') ? 700
    : w.includes('600') || w.includes('semi') ? 600
    : w.includes('500') || w.includes('medium') ? 500
    : 400

  return (
    <div className="gen-typo-role-row">
      <div className="gen-typo-aa">
        <span
          className="gen-typo-aa-glyph"
          style={{ fontWeight: previewWeight }}
        >
          Aa
        </span>
        <span className="gen-typo-aa-tag">{label}</span>
      </div>
      <div className="gen-typo-role-body">
        <div className="gen-typo-top-fields">
          <div className="gen-typo-f">
            <label>Cỡ chữ</label>
            <input type="text" value={roleData.size_pt} onChange={e => onChange(role, 'size_pt', e.target.value)} disabled={isRunning} placeholder="32–36pt" />
          </div>
          <div className="gen-typo-f">
            <label>Weight</label>
            <input type="text" value={roleData.weight} onChange={e => onChange(role, 'weight', e.target.value)} disabled={isRunning} placeholder="bold / regular" />
          </div>
          <div className="gen-typo-color-pick">
            <label>Màu</label>
            <div className="gen-typo-color-row">
              <input type="color" value={roleData.color} onChange={e => onChange(role, 'color', e.target.value)} disabled={isRunning} aria-label={`${label} màu chữ`} />
              <span className="gen-typo-color-code">{roleData.color.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div className="gen-typo-notes-row">
          <label className="gen-typo-notes-label">Ghi chú</label>
          <textarea
            className="gen-typo-notes"
            value={roleData.extra ?? ''}
            onChange={e => onChange(role, 'extra', e.target.value)}
            disabled={isRunning}
            rows={2}
            placeholder="letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.4…"
          />
        </div>
      </div>
    </div>
  )
})

/** Typography spec sheet — memo'd for same perf isolation as PaletteSwatchGrid. */
const TypographySpecSheet = memo(function TypographySpecSheet({
  typography,
  isRunning,
  onTopLevelChange,
  onRoleChange,
}: {
  typography: Typography
  isRunning: boolean
  onTopLevelChange: (field: 'font_family' | 'font_category' | 'weights_allowed', value: string) => void
  onRoleChange: (role: keyof Pick<Typography, 'title' | 'eyebrow' | 'body' | 'supporting'>, field: keyof TypographyRole, value: string) => void
}) {
  return (
    <div className="gen-typo-section">
      <div className="gen-spec-header">
        <span className="gen-spec-icon gen-spec-icon--violet">T</span>
        <h3 className="gen-spec-title">Kiểu chữ</h3>
      </div>
      <div className="gen-typo-meta">
        <div className="gen-typo-meta-field">
          <label className="gen-typo-meta-label">Font chính</label>
          <input className="gen-typo-meta-input" type="text" value={typography.font_family} onChange={e => onTopLevelChange('font_family', e.target.value)} disabled={isRunning} placeholder="e.g. Roboto" />
        </div>
        <div className="gen-typo-meta-field">
          <label className="gen-typo-meta-label">Danh mục</label>
          <input className="gen-typo-meta-input" type="text" value={typography.font_category} onChange={e => onTopLevelChange('font_category', e.target.value)} disabled={isRunning} placeholder="e.g. Sans-serif" />
        </div>
        <div className="gen-typo-meta-field">
          <label className="gen-typo-meta-label">Weights được phép</label>
          <input className="gen-typo-meta-input" type="text" value={typography.weights_allowed} onChange={e => onTopLevelChange('weights_allowed', e.target.value)} disabled={isRunning} placeholder="400, 700" />
        </div>
      </div>
      <div className="gen-typo-roles">
        {(Object.keys(TYPO_ROLE_LABELS) as Array<keyof typeof TYPO_ROLE_LABELS>).map(role => (
          <TypoRoleRow
            key={role}
            role={role}
            label={TYPO_ROLE_LABELS[role]}
            roleData={typography[role]}
            isRunning={isRunning}
            onChange={onRoleChange}
          />
        ))}
      </div>
    </div>
  )
})

/** Single interactive glass card for one AI direction field.
 *  Glows on textarea focus; independently memo'd so only the changed card re-renders. */
const DirectionCard = memo(function DirectionCard({
  field,
  icon,
  label,
  hint,
  value,
  isRunning,
  onChange,
}: {
  field: DescTextField
  icon: string
  label: string
  hint: string
  value: string
  isRunning: boolean
  onChange: (field: DescTextField, value: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div className={`gen-dir-card${focused ? ' gen-dir-card--focused' : ''}`}>
      <div className="gen-dir-top">
        <span className="gen-dir-icon">{icon}</span>
        <div className="gen-dir-meta">
          <strong className="gen-dir-label">{label}</strong>
          <span className="gen-dir-hint">{hint}</span>
        </div>
      </div>
      <textarea
        className="gen-dir-textarea"
        value={value}
        onChange={e => onChange(field, e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        disabled={isRunning}
        placeholder={hint}
      />
    </div>
  )
})

/** 2-column grid of 4 Direction Cards — memo'd; each card is also independently memo'd. */
const DesignDirectionCards = memo(function DesignDirectionCards({
  tone,
  keyMessageRule,
  density,
  visual,
  isRunning,
  onChange,
}: {
  tone: string
  keyMessageRule: string
  density: string
  visual: string
  isRunning: boolean
  onChange: (field: DescTextField, value: string) => void
}) {
  return (
    <div className="gen-desc-fields">
      <DirectionCard field="tone"            icon={DESC_ICONS.tone}            label={DESC_LABELS.tone}            hint={DESC_HINTS.tone}            value={tone}           isRunning={isRunning} onChange={onChange} />
      <DirectionCard field="key_message_rule" icon={DESC_ICONS.key_message_rule} label={DESC_LABELS.key_message_rule} hint={DESC_HINTS.key_message_rule} value={keyMessageRule} isRunning={isRunning} onChange={onChange} />
      <DirectionCard field="density"         icon={DESC_ICONS.density}         label={DESC_LABELS.density}         hint={DESC_HINTS.density}         value={density}        isRunning={isRunning} onChange={onChange} />
      <DirectionCard field="visual"          icon={DESC_ICONS.visual}          label={DESC_LABELS.visual}          hint={DESC_HINTS.visual}          value={visual}         isRunning={isRunning} onChange={onChange} />
    </div>
  )
})

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export function GeneratePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // ── Form state — một object duy nhất để dễ serialize thành draft/generate payload
  const [formData, setFormData] = useState({
    purpose: '',
    audience: '',
    style: 'minimalist',
    primary_color: '#667eea',
    slide_count: 8,
    primary_layout: 'key_message',
    content: '',
    language: 'vi',
  })

  const [files, setFiles] = useState<File[]>([])

  // "Khác" (tự nhập) cho phong cách / bố cục
  const [isCustomStyle, setIsCustomStyle] = useState(false)
  const [isCustomLayout, setIsCustomLayout] = useState(false)

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

  // Local state for the content textarea — typing here only updates contentLocal + contentLatestRef.
  // formData.content is NOT mutated on every keystroke, so GeneratePage never re-renders from
  // content input. The ref is read synchronously by handleSubmit and draft saves to guarantee
  // the API always receives the latest value regardless of blur timing.
  const [contentLocal, setContentLocal] = useState(formData.content)
  const contentLatestRef = useRef(formData.content)

  const descRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  // "Latest ref" pattern — giữ reference đến phiên bản mới nhất của handleSubmit mà không
  // làm keyboard shortcut effect (deps=[]) phải re-register listener mỗi render.
  const latestHandleSubmit = useRef<(e: React.FormEvent) => Promise<void>>(async (_e) => { })

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  // Hydrate form từ draft khi navigate('/generate', { state: { draft } }).
  // replaceState ngay sau để URL không giữ lại state cũ nếu user F5 trang.
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
    setIsCustomStyle(!STYLE_OPTIONS.some(o => o.value !== CUSTOM_OPTION && o.value === draft.style))
    setIsCustomLayout(!LAYOUT_OPTIONS.some(o => o.value !== CUSTOM_OPTION && o.value === draft.primary_layout))
    setDraftMessage('Đã tải bản nháp')
    window.history.replaceState({}, '', '/generate')
  }, [location.state])

  // Tự scroll xuống description panel khi Phase 1 xong
  useEffect(() => {
    if (description && descRef.current) {
      setTimeout(() => descRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [description])

  // Polling Phase 2 — kiểm tra trạng thái job mỗi 2s.
  // 2s là điểm cân bằng giữa UX (phản hồi nhanh) và tải server (không spam quá nhiều request).
  // Backend pipeline thường mất 5–20s tuỳ độ phức tạp nội dung.
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
        // Không thể lấy trạng thái job — có thể mạng bị ngắt hoặc server restart.
        // Đặt status FAILED để hiện thông báo lỗi thay vì polling vô tận.
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

  // Sync external mutations of formData.content (clear button, draft hydration) into contentLocal.
  // Guard condition prevents our own typing from looping: handleContentChange keeps
  // contentLatestRef.current in sync with what was typed, so the check only fires when something
  // outside (clear button / draft load) changes formData.content.
  useEffect(() => {
    if (formData.content !== contentLatestRef.current) {
      contentLatestRef.current = formData.content
      setContentLocal(formData.content)
    }
  }, [formData.content])


  // Ctrl/Cmd+Enter khi focus vào content textarea → submit form
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement === contentTextareaRef.current) {
          e.preventDefault()
          void latestHandleSubmit.current({ preventDefault: () => { } } as unknown as React.FormEvent)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const clampSlideCount = (value: number) => {
    if (Number.isNaN(value)) return SLIDE_MIN
    return Math.min(SLIDE_MAX, Math.max(SLIDE_MIN, value))
  }

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target

    if (name === 'slide_count') {
      updateFormField('slide_count', clampSlideCount(parseInt(value, 10)))
      return
    }

    updateFormField(name as keyof typeof formData, value)
  }

  // deps=[] an toàn vì dùng functional updater `prev => ...` — không cần capture formData.
  // Gọi setDescription(null) khi các field thiết kế thay đổi để buộc người dùng
  // chạy lại Phase 1 và tránh mâu thuẫn giữa DesignDescription cũ và brief mới.
  const updateFormField = useCallback((name: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    if (['purpose', 'audience', 'style', 'primary_layout', 'primary_color', 'language'].includes(name)) {
      setDescription(null)
      setDescError('')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // deps=[] is correct: every setter below (setIsCustomStyle, setFormData, setDescription,
  // setDescError) has a stable identity guaranteed by React. The functional updater for
  // setFormData avoids capturing formData in the closure, so these handlers never go stale.
  // Removing the [updateFormField] dep closes the last reference that could theoretically
  // change (even though updateFormField itself is [] — belt-and-suspenders).
  const handleStyleSelect = useCallback((value: string, isCustom: boolean) => {
    setIsCustomStyle(isCustom)
    setFormData(prev => ({ ...prev, style: isCustom ? '' : value }))
    setDescription(null)
    setDescError('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLayoutSelect = useCallback((value: string, isCustom: boolean) => {
    setIsCustomLayout(isCustom)
    setFormData(prev => ({ ...prev, primary_layout: isCustom ? '' : value }))
    setDescription(null)
    setDescError('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable handler: updates only local state + ref, never formData.
  // GeneratePage does NOT re-render from content keystrokes.
  const handleContentChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target
    contentLatestRef.current = value
    setContentLocal(value)
  }, [])

  // Flush typed content to formData on blur (keeps formData consistent for edge-case reads).
  const handleContentBlur = useCallback(() => {
    setFormData(prev => ({ ...prev, content: contentLatestRef.current }))
  }, [])

  const handlePaletteColorChange = useCallback((field: 'secondary' | 'accent', value: string) => {
    setDescription(prev =>
      prev ? { ...prev, color_palette: { ...prev.color_palette, [field]: value } } : null
    )
  }, [])

  const handlePaletteNeutralChange = useCallback((index: number, value: string) => {
    setDescription(prev => {
      if (!prev) return null
      const neutrals = [...prev.color_palette.neutrals]
      neutrals[index] = value
      return { ...prev, color_palette: { ...prev.color_palette, neutrals } }
    })
  }, [])

  const handlePaletteDescriptionChange = useCallback((value: string) => {
    setDescription(prev =>
      prev ? { ...prev, color_palette: { ...prev.color_palette, description: value } } : null
    )
  }, [])

  const handleTypographyTopLevel = useCallback((field: 'font_family' | 'font_category' | 'weights_allowed', value: string) => {
    setDescription(prev =>
      prev ? { ...prev, typography: { ...prev.typography, [field]: value } } : null
    )
  }, [])

  const handleTypographyRoleChange = useCallback((
    role: keyof Pick<Typography, 'title' | 'eyebrow' | 'body' | 'supporting'>,
    field: keyof TypographyRole,
    value: string
  ) => {
    setDescription(prev =>
      prev ? {
        ...prev,
        typography: {
          ...prev.typography,
          [role]: { ...prev.typography[role], [field]: value },
        },
      } : null
    )
  }, [])

  const handleDirectionChange = useCallback((field: DescTextField, value: string) => {
    setDescription(prev => prev ? { ...prev, [field]: value } : null)
  }, [])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  // ── DRAFT ─────────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    setDraftMessage('')
    if (formData.purpose.trim().length < 3 || formData.audience.trim().length < 3) {
      setDraftMessage('Cần nhập mục đích và đối tượng trước khi lưu Draft')
      return
    }

    setIsDraftSaving(true)
    const payload: SaveDraftPayload = {
      ...formData,
      content: contentLatestRef.current,
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
      // Lấy chuỗi lỗi từ FastAPI response body: { detail: "..." }
      setDraftMessage(err.response?.data?.detail || 'Lưu nháp thất bại')
    } finally {
      setIsDraftSaving(false)
    }
  }

  // ── PHASE 1: AI DESIGN ANALYSIS ──────────────────────────────────────────

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
      // err.response?.data?.detail — chuỗi lỗi từ FastAPI (rate limit, Gemini quota, v.v.)
      setDescError(err.response?.data?.detail || 'Lỗi khi phân tích thiết kế. Vui lòng thử lại.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── PHASE 2: MASTER PROMPT GENERATION ────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    // Read from ref, not formData.content — the textarea may not have blurred yet.
    if (!contentLatestRef.current.trim() && files.length === 0) {
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
        content: contentLatestRef.current,
        files: files.length > 0 ? files : undefined,
        description: description || undefined,
      })
      setJobId(response.data.job_id)
      setIsPolling(true)
    } catch (err: any) {
      // Axios đặt backend response vào err.response.data; FastAPI trả lỗi dạng { detail: "..." }
      const detail = err.response?.data?.detail
      setSubmitError(detail || 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Cập nhật ref mỗi render để keyboard shortcut effect (deps=[]) luôn gọi đúng
  // phiên bản handleSubmit mới nhất — tránh stale closure qua event listener tồn tại lâu dài.
  latestHandleSubmit.current = handleSubmit

  // ── RESULT & UTILITY HANDLERS ────────────────────────────────────────────

  const handleCopy = async () => {
    const text = jobStatus?.result?.full_master_prompt
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API thất bại (iframe sandbox hoặc Firefox cũ) — fallback execCommand
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

          <div className="gen-header-actions">
            <ThemeToggle />

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
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────── */}
      <main className="gen-main">
        <section className="gen-builder-hero">
          <div className="gen-kicker">
            <span className="gen-kicker-dot" />
            Hệ thống Cấu trúc Prompt Slide chuyên nghiệp
          </div>

          <h1>
            Khơi nguồn{' '}
            <span className="gen-gradient-pink">Ý tưởng Slide</span>
            <br />
            Xây dựng cấu trúc thần tốc
          </h1>

          <p>
            Điền brief, chọn phong cách thiết kế, để AI phân tích định hướng trình bày
            rồi sinh Master Prompt hoàn chỉnh cho PowerPoint, Marp hoặc bất kỳ slide deck nào.
          </p>

          <div className="gen-stepper">
            <div className={`gen-step ${formData.purpose && formData.audience ? 'done' : 'active'}`}>
              <span>1</span>
              <strong>Thông tin Brief</strong>
            </div>
            <div className={`gen-step ${description ? 'done' : formData.purpose && formData.audience ? 'active' : ''}`}>
              <span>2</span>
              <strong>Định hướng Thiết kế</strong>
            </div>
            <div className={`gen-step ${description ? 'active' : ''}`}>
              <span>3</span>
              <strong>Nội dung Nguồn</strong>
            </div>
            <div className={`gen-step ${status === 'COMPLETED' ? 'done active' : ''}`}>
              <span>4</span>
              <strong>Cấu trúc Prompt</strong>
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
            <span className="gen-console-title">Thiết kế prompt</span>

            {/* 🛠️ SỬA LẠI KHỐI NÚT BẤM TRONG JSX: */}
            <div className="gen-form-toolbar">
              {draftMessage && <span className="gen-draft-message">{draftMessage}</span>}
              <button
                type="button"
                className="gen-draft-btn"
                onClick={handleSaveDraft}
                disabled={isDraftSaving || isFormLocked} // <-- Bỏ isAutoSaving ở đây
              >
                {/* Thay vì check điều kiện loằng ngoằng, ép cứng chữ theo đúng ý định của bạn */}
                {isDraftSaving ? 'Đang lưu...' : currentDraftId ? 'Cập nhật bản nháp' : 'Lưu thành bản nháp'}
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

              <StyleCardGrid
                selectedValue={formData.style}
                isCustom={isCustomStyle}
                disabled={isFormLocked}
                onSelect={handleStyleSelect}
              />

              {isCustomStyle && (
                <div className="gen-field gen-custom-field">
                  <label>Phong cách của bạn</label>
                  <input
                    type="text"
                    value={formData.style}
                    onChange={(e) => updateFormField('style', e.target.value)}
                    placeholder="Vd: Vintage, Y2K, Bauhaus..."
                    disabled={isFormLocked}
                  />
                </div>
              )}
            </div>

            <div className="gen-subsection">
              <div className="gen-subsection-title">
                <span>02</span>
                <strong>Bố cục chính</strong>
              </div>

              <LayoutCardGrid
                selectedValue={formData.primary_layout}
                isCustom={isCustomLayout}
                disabled={isFormLocked}
                onSelect={handleLayoutSelect}
              />

              {isCustomLayout && (
                <div className="gen-field gen-custom-field">
                  <label>Bố cục của bạn</label>
                  <input
                    type="text"
                    value={formData.primary_layout}
                    onChange={(e) => updateFormField('primary_layout', e.target.value)}
                    placeholder="Vd: Q&A, Agenda, Team Profile..."
                    disabled={isFormLocked}
                  />
                </div>
              )}
            </div>

            {/* Live layout preview panel */}
            <div className="gen-layout-preview">
              <div className="gen-preview-topbar">
                <div className="gen-window-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="gen-preview-name">layout.preview</span>
                <span className="gen-preview-badge">
                  {isCustomLayout
                    ? (formData.primary_layout || 'Tùy chỉnh')
                    : (LAYOUT_OPTIONS.find(o => o.value === formData.primary_layout)?.label ?? formData.primary_layout)}
                </span>
              </div>
              <div className="gen-preview-body">
                <GenDeckVisual
                  key={isCustomLayout ? '__custom__' : formData.primary_layout}
                  type={isCustomLayout ? '__custom__' : formData.primary_layout}
                />
              </div>
            </div>

            <div className="gen-control-grid">
              <div className="gen-field">
                <label>Số slide</label>
                <div className="gen-slide-pills">
                  {SLIDE_PRESETS.map(count => (
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
                  min={SLIDE_MIN}
                  max={SLIDE_MAX}
                  step={1}
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
                disabled={
                  isFormLocked ||
                  formData.purpose.trim().length < 3 ||
                  formData.audience.trim().length < 3 ||
                  (isCustomStyle && !formData.style.trim()) ||
                  (isCustomLayout && !formData.primary_layout.trim())
                }
                className="gen-analyze-btn"
              >
                {isAnalyzing ? (
                  <>
                    <span className="gen-btn-spinner" />
                    Đang phân tích thiết kế...
                  </>
                ) : (
                  <>✦ Phân tích Định hướng Thiết kế</>
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

            <PaletteSwatchGrid
              palette={description.color_palette}
              isRunning={isRunning}
              onColorChange={handlePaletteColorChange}
              onNeutralChange={handlePaletteNeutralChange}
              onDescChange={handlePaletteDescriptionChange}
            />

            <TypographySpecSheet
              typography={description.typography}
              isRunning={isRunning}
              onTopLevelChange={handleTypographyTopLevel}
              onRoleChange={handleTypographyRoleChange}
            />

            <DesignDirectionCards
              tone={description.tone}
              keyMessageRule={description.key_message_rule}
              density={description.density}
              visual={description.visual}
              isRunning={isRunning}
              onChange={handleDirectionChange}
            />
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
                <div className="gen-content-field-wrap">
                  <textarea
                    ref={contentTextareaRef}
                    name="content"
                    value={contentLocal}
                    onChange={handleContentChange}
                    onBlur={handleContentBlur}
                    placeholder="Dán nội dung bạn muốn chuyển thành slide..."
                    rows={8}
                    disabled={isRunning}
                  />
                  {contentLocal.length > 0 && (
                    <button
                      type="button"
                      className="gen-content-clear"
                      onClick={() => {
                        contentLatestRef.current = ''
                        setContentLocal('')
                        setFormData(prev => ({ ...prev, content: '' }))
                      }}
                      disabled={isRunning}
                      aria-label="Xóa nội dung"
                    >
                      ×
                    </button>
                  )}
                </div>
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
                            <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{submitError}</span>
              </div>
            )}

            <button type="submit" disabled={isRunning} className="gen-submit">
              {isRunning ? 'Đang xử lý...' : '🚀 Tạo Master Prompt'}
            </button>
          </form>
        )}

        {(isRunning || jobStatus) && (
          <div ref={resultRef} className="gen-result-area">
            {isRunning && (
              <div className="gen-status-card">
                <div className="gen-shimmer-skeleton">
                  <div className="gen-shimmer-row">
                    <div className="gen-shimmer-dot" />
                    <div className="gen-shimmer-lines">
                      <div className="gen-shimmer-bar gen-shimmer-bar--title" />
                      <div className="gen-shimmer-bar gen-shimmer-bar--sub" />
                    </div>
                  </div>
                  <div className="gen-shimmer-body">
                    <div className="gen-shimmer-bar gen-shimmer-bar--wide" />
                    <div className="gen-shimmer-bar gen-shimmer-bar--mid" />
                  </div>
                </div>
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

                {copied && (
                  <p className="gen-copy-hint">
                    Bấm Ctrl+V (hoặc Cmd+V) vào ChatGPT, Claude hoặc Gemini để dựng slide ngay!
                  </p>
                )}

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
