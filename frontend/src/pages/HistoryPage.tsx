import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { draftAPI, historyAPI, HistoryItem, JobResult } from '../services/api'
import './HistoryPage.css'

type HistoryTab = 'ALL' | 'COMPLETED' | 'DRAFT' | 'FAILED'

const TABS: Array<{ key: HistoryTab; label: string }> = [
  { key: 'ALL', label: 'Tat ca' },
  { key: 'COMPLETED', label: 'Hoan thanh' },
  { key: 'DRAFT', label: 'Nhap' },
  { key: 'FAILED', label: 'That bai' },
]

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Hoan thanh',
  DRAFT: 'Nhap',
  FAILED: 'That bai',
}

interface ResultModalItem extends HistoryItem {
  result?: JobResult | null
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<HistoryTab>('ALL')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultModal, setResultModal] = useState<ResultModalItem | null>(null)

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true)
      setError('')
      try {
        const filter = activeTab === 'ALL' ? undefined : activeTab
        const res = await historyAPI.getHistory(filter)
        setItems(res.data)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Khong tai duoc lich su')
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [activeTab])

  const handleDelete = async (id: string) => {
    await historyAPI.softDelete(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleResume = async (item: HistoryItem) => {
    const res = await draftAPI.getDraft(item.id)
    navigate('/generate', {
      state: { draft: { ...res.data, draftId: item.id } },
    })
  }

  const handleViewResult = async (item: HistoryItem) => {
    const res = await historyAPI.getJobResult(item.id)
    setResultModal({ ...item, result: res.data.result })
  }

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <h1>Lich su Prompt</h1>
          <p>Xem lai prompt da tao, ban nhap va cac lan tao that bai.</p>
        </div>
        <div className="history-actions">
          <button onClick={() => navigate('/generate')}>Tao prompt moi</button>
          <button onClick={() => navigate('/bin')}>Thung rac</button>
        </div>
      </header>

      <nav className="history-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <div className="history-error">{error}</div>}
      {isLoading && <div className="history-empty">Dang tai...</div>}

      {!isLoading && items.length === 0 && (
        <div className="history-empty">
          <p>Chua co muc nao trong tab nay.</p>
          <button onClick={() => navigate('/generate')}>Tao prompt moi</button>
        </div>
      )}

      <div className="history-list">
        {items.map((item) => (
          <article key={item.id} className={`history-card status-${item.status.toLowerCase()}`}>
            <div>
              <span className="history-status">{STATUS_LABELS[item.status] || item.status}</span>
              <h2>{item.purpose || 'Khong co tieu de'}</h2>
              <p>{new Date(item.updated_at).toLocaleString()}</p>
              {item.error_message && <p className="history-item-error">{item.error_message}</p>}
            </div>
            <div className="history-card-actions">
              {item.status === 'COMPLETED' && item.has_result && (
                <button onClick={() => handleViewResult(item)}>Xem ket qua</button>
              )}
              {item.status === 'DRAFT' && (
                <button onClick={() => handleResume(item)}>Tiep tuc</button>
              )}
              <button className="danger" onClick={() => handleDelete(item.id)}>Xoa</button>
            </div>
          </article>
        ))}
      </div>

      {resultModal && (
        <div className="history-modal-backdrop" onClick={() => setResultModal(null)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{resultModal.purpose || 'Ket qua'}</h2>
              <button onClick={() => setResultModal(null)}>Dong</button>
            </header>
            <pre>{resultModal.result?.full_master_prompt || 'Khong co ket qua'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
