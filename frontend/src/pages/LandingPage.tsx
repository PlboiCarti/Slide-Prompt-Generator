import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import './LandingPage.css'

const DECK_LAYOUTS = [
  { type: 'key-message', label: 'Key Message' },
  { type: 'split', label: 'Split' },
  { type: 'grid-cards', label: 'Grid Cards' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'big-stat', label: 'Big Stat' },
] as const

function DeckVisual({ type }: { type: (typeof DECK_LAYOUTS)[number]['type'] }) {
  switch (type) {
    case 'key-message':
      return (
        <div className="deck-visual deck-visual--key-message">
          <span className="deck-bar deck-bar--accent" />
          <span className="deck-bar deck-bar--sub" />
        </div>
      )
    case 'split':
      return (
        <div className="deck-visual deck-visual--split">
          <div className="deck-split-text">
            <span className="deck-line" />
            <span className="deck-line" />
            <span className="deck-line deck-line--short" />
          </div>
          <div className="deck-split-block" />
        </div>
      )
    case 'grid-cards':
      return (
        <div className="deck-visual deck-visual--grid-cards">
          <span className="deck-card-cell" />
          <span className="deck-card-cell" />
          <span className="deck-card-cell" />
          <span className="deck-card-cell" />
        </div>
      )
    case 'timeline':
      return (
        <div className="deck-visual deck-visual--timeline">
          <span className="deck-timeline-track" />
          <span className="deck-timeline-dot" />
          <span className="deck-timeline-dot" />
          <span className="deck-timeline-dot" />
          <span className="deck-timeline-dot" />
        </div>
      )
    case 'big-stat':
      return (
        <div className="deck-visual deck-visual--big-stat">
          <span className="deck-stat-number">72%</span>
          <span className="deck-bar deck-bar--sub" />
        </div>
      )
  }
}

const features = [
  {
    title: 'Tối Ưu Hóa Từ Khóa',
    desc: 'Tự động biến ý tưởng thô thành brief rõ ràng, có mục tiêu, audience và thông điệp chính.',
    icon: '✦',
    className: 'landing-feature-large',
  },
  {
    title: 'Cấu Trúc Slide Chuyên Nghiệp',
    desc: 'Sinh cấu trúc slide theo bố cục chuẩn: key message, split, grid cards, timeline, big stat.',
    icon: '▣',
  },
  {
    title: 'Định Hướng Thiết Kế AI',
    desc: 'Gợi ý tone màu, font chữ, mật độ thông tin và hướng hình ảnh trước khi tạo Master Prompt.',
    icon: '◈',
  },
  {
    title: 'Hỗ Trợ Đa Ngôn Ngữ',
    desc: 'Sẵn sàng tạo prompt bằng tiếng Việt hoặc tiếng Anh phù hợp với nhiều ngữ cảnh trình bày.',
    icon: '⌁',
  },
  {
    title: 'Master Prompt Một Cú Click',
    desc: 'Sao chép một lần và dùng ngay với ChatGPT, Claude hoặc Gemini để dựng slide trong vài giây.',
    icon: '↗',
    className: 'landing-feature-wide',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeDeckIndex, setActiveDeckIndex] = useState(0)

  const handleGetStarted = () => {
    navigate(user ? '/generate' : '/login')
  }

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = setInterval(() => {
      setActiveDeckIndex(index => (index + 1) % DECK_LAYOUTS.length)
    }, 2800)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="landing-page">
      <div className="landing-glow landing-glow-pink" />
      <div className="landing-glow landing-glow-blue" />

      {/* Header */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <button className="landing-brand" onClick={() => navigate('/')}>
            <span className="landing-brand-logo">PB</span>
            <span>Slide Prompt Builder</span>
          </button>

          <nav className="landing-nav-links">
            <a href="#demo">Trải nghiệm</a>
            <a href="#features">Tính năng</a>
            <button className="landing-nav-login" onClick={handleGetStarted}>
              {user ? 'Mở Builder' : 'Đăng nhập'}
            </button>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-pill">
            <span className="landing-pulse" />
            Quy trình tạo prompt bằng AI cho những slide ấn tượng
          </div>

            <h1>
                <span className="hero-line">Thiết Kế Prompt Thông Minh Hơn</span>
                <span className="hero-line">Tạo Ra Slide Ấn Tượng Hơn</span>
            </h1>

          <p className="landing-hero-desc">
            Xây dựng các Master Prompt sẵn sàng cho bài thuyết trình với định hướng thiết kế AI, 
            cấu trúc slide, sơ đồ nội dung và hướng dẫn trực quan sắc nét chỉ trong một quy trình.
          </p>

          <div className="landing-hero-actions">
            <button className="landing-btn landing-btn-primary" onClick={handleGetStarted}>
              Bắt Đầu Ngay
            </button>
            <a className="landing-btn landing-btn-secondary" href="#demo">
              Khám Phá Mẫu
            </a>
          </div>
        </section>

        {/* Quick Interactive Demo */}
        <section id="demo" className="landing-section landing-demo-section">
          <div className="landing-section-heading">
            <span className="landing-kicker">Bản Demo Tương Tác Nhanh</span>
            <h2>Từ ý tưởng thô đến cấu trúc slide hoàn thiện.</h2>
            <p>
              Mô phỏng luồng xử lý chính: nhập brief bên trái, AI tự động dựng cấu trúc slide
              bên phải theo các bố cục chuẩn cho bài thuyết trình.
            </p>
          </div>

          <div className="landing-demo-card">
            <div className="landing-demo-toolbar">
              <div className="landing-demo-status">
                <span className="landing-pulse" />
                Đang dựng cấu trúc slide
              </div>
              <span className="landing-demo-title">Xem trước cấu trúc slide</span>
            </div>

            <div className="landing-demo-grid">
              <div className="landing-demo-left">
                <label>
                  Mục Tiêu Bài Thuyết Trình
                  <textarea
                    readOnly
                    value="Pitch deck giới thiệu sản phẩm AI giúp sinh slide nhanh cho sinh viên và team marketing."
                  />
                </label>

                <div className="landing-demo-options">
                  <div className="landing-chip active">Hiện Đại</div>
                  <div className="landing-chip">Kỹ Thuật</div>
                  <div className="landing-chip">Sáng Tạo</div>
                </div>

                <div className="landing-demo-mini-grid">
                  <div>
                    <span>Số Slide</span>
                    <strong>08</strong>
                  </div>
                  <div>
                    <span>Bố Cục</span>
                    <strong>Grid Cards</strong>
                  </div>
                </div>
              </div>

              <div className="landing-demo-right">
                <div className="landing-deck-grid">
                  {DECK_LAYOUTS.map((layout, index) => (
                    <article
                      key={layout.type}
                      className={`landing-deck-card ${index === activeDeckIndex ? 'active' : ''}`}
                    >
                      <span className="landing-deck-label">{layout.label}</span>
                      <DeckVisual type={layout.type} />
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-kicker">Tính Năng Cốt Lõi</span>
            <h2>Mọi công cụ cần thiết để tạo prompt slide tốt hơn.</h2>
            <p>
              Tập trung giải quyết 3 giá trị cốt lõi: tối ưu cấu trúc từ khóa, 
              định hình layout slide và định hướng thẩm mỹ trực quan.
            </p>
          </div>

          <div className="landing-bento">
            {features.map(feature => (
              <article
                key={feature.title}
                className={`landing-feature-card ${feature.className || ''}`}
              >
                <div className="landing-feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <p>© {new Date().getFullYear()} Slide Prompt Builder. Tất cả các quyền được bảo lưu.</p>
          <div className="landing-footer-links">
            <a href="#demo">Trải nghiệm</a>
            <a href="#features">Tính năng</a>
          </div>
        </div>
      </footer>
    </div>
  )
}