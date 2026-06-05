import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './LandingPage.css'

const features = [
  {
    title: 'Keyword Optimization',
    desc: 'Tự động biến ý tưởng thô thành brief rõ ràng, có mục tiêu, audience và thông điệp chính.',
    icon: '✦',
    className: 'landing-feature-large',
  },
  {
    title: 'PowerPoint Structure',
    desc: 'Sinh cấu trúc slide theo layout: key message, split, grid cards, timeline, big stat.',
    icon: '▣',
  },
  {
    title: 'AI Design Direction',
    desc: 'Gợi ý tone, font, mật độ thông tin và hướng hình ảnh trước khi tạo Master Prompt.',
    icon: '◈',
  },
  {
    title: 'Multi-language Ready',
    desc: 'Hỗ trợ tạo prompt bằng tiếng Việt hoặc tiếng Anh cho nhiều ngữ cảnh trình bày.',
    icon: '⌁',
  },
  {
    title: 'One-click Master Prompt',
    desc: 'Copy một lần và dùng ngay với ChatGPT, Claude hoặc Gemini để dựng slide.',
    icon: '↗',
    className: 'landing-feature-wide',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleGetStarted = () => {
    navigate(user ? '/generate' : '/login')
  }

  return (
    <div className="landing-page">
      <div className="landing-glow landing-glow-pink" />
      <div className="landing-glow landing-glow-blue" />

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <button className="landing-brand" onClick={() => navigate('/')}>
            <span className="landing-brand-logo">PB</span>
            <span>Slide Prompt Builder</span>
          </button>

          <nav className="landing-nav-links">
            <a href="#demo">Demo</a>
            <a href="#features">Features</a>
            <button className="landing-nav-login" onClick={handleGetStarted}>
              {user ? 'Open Builder' : 'Login'}
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-pill">
            <span className="landing-pulse" />
            AI-powered prompt workflow for stunning slides
          </div>

          <h1>
            Craft{' '}
            <span className="gradient-pink">Smarter Prompts.</span>
            <br />
            Generate{' '}
            <span className="gradient-blue">Stunning Slides.</span>
          </h1>

          <p className="landing-hero-desc">
            Build presentation-ready Master Prompts with AI design direction,
            slide structure, content mapping and polished visual guidance in one flow.
          </p>

          <div className="landing-hero-actions">
            <button className="landing-btn landing-btn-primary" onClick={handleGetStarted}>
              Get Started
            </button>
            <a className="landing-btn landing-btn-secondary" href="#demo">
              Explore Templates
            </a>
          </div>
        </section>

        {/* Quick Interactive Demo */}
        <section id="demo" className="landing-section landing-demo-section">
          <div className="landing-section-heading">
            <span className="landing-kicker">Quick Interactive Demo</span>
            <h2>From rough idea to polished AI prompt.</h2>
            <p>
              Mô phỏng luồng chính của app: nhập brief bên trái, AI preview prompt
              bên phải theo phong cách dark tech.
            </p>
          </div>

          <div className="landing-demo-card">
            <div className="landing-demo-toolbar">
              <div className="landing-window-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="landing-demo-title">Prompt Builder Console</span>
            </div>

            <div className="landing-demo-grid">
              <div className="landing-demo-left">
                <label>
                  Presentation Goal
                  <textarea
                    readOnly
                    value="Pitch deck giới thiệu sản phẩm AI giúp sinh slide nhanh cho sinh viên và team marketing."
                  />
                </label>

                <div className="landing-demo-options">
                  <div className="landing-chip active">Modern</div>
                  <div className="landing-chip">Technical</div>
                  <div className="landing-chip">Creative</div>
                </div>

                <div className="landing-demo-mini-grid">
                  <div>
                    <span>Slides</span>
                    <strong>08</strong>
                  </div>
                  <div>
                    <span>Layout</span>
                    <strong>Grid Cards</strong>
                  </div>
                </div>
              </div>

              <div className="landing-demo-right">
                <pre>
{`SYSTEM:
You are an expert presentation strategist.

GOAL:
Create a high-impact slide deck for an AI product.

STYLE:
- Dark tech visual direction
- Neon gradient accents
- Strong key message per slide

OUTPUT:
1. Slide title
2. Key message
3. Layout suggestion
4. Visual direction
5. Speaker notes`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-kicker">Bento Grid Features</span>
            <h2>Everything needed to build better slide prompts.</h2>
            <p>
              Tập trung vào 3 giá trị chính: tối ưu prompt, cấu trúc slide,
              và định hướng thiết kế trực quan.
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
    </div>
  )
}