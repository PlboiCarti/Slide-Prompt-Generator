import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { binAPI, BinItem, draftAPI, historyAPI, HistoryItem, JobResult } from '../services/api'
import './HistoryPage.css'

type HistoryTab = 'ALL' | 'COMPLETED' | 'DRAFT' | 'FAILED' | 'BIN'

const TABS: Array<{ key: HistoryTab; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'COMPLETED', label: 'Hoàn thành' },
  { key: 'DRAFT', label: 'Bản nháp' },
  { key: 'FAILED', label: 'Thất bại' },
  { key: 'BIN', label: 'Thùng rác' },
]

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Hoàn thành',
  DRAFT: 'Bản nháp',
  FAILED: 'Thất bại',
}

interface ResultModalItem extends HistoryItem {
  result?: JobResult | null
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [binItems, setBinItems] = useState<BinItem[]>([])
  const [activeTab, setActiveTab] = useState<HistoryTab>('ALL')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultModal, setResultModal] = useState<ResultModalItem | null>(null)

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true)
      setError('')
      try {
        if (activeTab === 'BIN') {
          const res = await binAPI.getBin()
          setBinItems(res.data)
          setItems([])
        } else {
          const filter = activeTab === 'ALL' ? undefined : activeTab
          const res = await historyAPI.getHistory(filter)
          setItems(res.data)
          setBinItems([])
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Không tải được lịch sử')
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

  const handleRestore = async (id: string) => {
    await binAPI.restore(id)
    setBinItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleHardDelete = async (id: string) => {
    if (!confirm('Xóa vĩnh viễn mục này? Hành động này không thể hoàn tác.')) return
    await binAPI.hardDelete(id)
    setBinItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleEmptyBin = async () => {
    if (!confirm('Xóa vĩnh viễn tất cả mục trong thùng rác? Hành động này không thể hoàn tác.')) return
    await binAPI.emptyBin()
    setBinItems([])
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

  const isBinTab = activeTab === 'BIN'
  const visibleCount = isBinTab ? binItems.length : items.length

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <h1>Lịch sử Prompt</h1>
          <p>Xem lại prompt đã tạo, bản nháp, lần tạo thất bại và các mục trong thùng rác.</p>
        </div>
        <div className="history-actions">
          <button
            type="button"
            className="history-secondary"
            onClick={() => navigate('/')}
          >
            Trang chủ
          </button>

          <button
            type="button"
            className="history-primary"
            onClick={() => navigate('/generate')}
          >
            + Tạo prompt mới
          </button>

          {isBinTab && binItems.length > 0 && (
            <button type="button" className="danger" onClick={handleEmptyBin}>
              Dọn sạch thùng rác
            </button>
          )}
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
      {isLoading && <div className="history-empty">Đang tải...</div>}

      {!isLoading && visibleCount === 0 && (
        <div className="history-empty">
          <p>{isBinTab ? 'Thùng rác đang trống.' : 'Chưa có mục nào trong tab này.'}</p>
          {!isBinTab && <button onClick={() => navigate('/generate')}>Tạo prompt mới</button>}
        </div>
      )}

      {!isBinTab && (
        <div className="history-list">
          {items.map((item) => (
            <article key={item.id} className={`history-card status-${item.status.toLowerCase()}`}>
              <div>
                <span className="history-status">{STATUS_LABELS[item.status] || item.status}</span>
                <h2>Mục đích: {item.purpose || 'Không có thông tin'}</h2>
                <p>Đối tượng: {item.audience || 'Không có thông tin'}</p>
                <p>Cập nhật: {new Date(item.updated_at).toLocaleString()}</p>
                {item.error_message && <p className="history-item-error">{item.error_message}</p>}
              </div>
              <div className="history-card-actions">
                {item.status === 'COMPLETED' && item.has_result && (
                  <button onClick={() => handleViewResult(item)}>Xem kết quả</button>
                )}
                {item.status === 'DRAFT' && (
                  <button onClick={() => handleResume(item)}>Tiếp tục</button>
                )}
                <button className="danger" onClick={() => handleDelete(item.id)}>Xóa</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isBinTab && (
        <div className="history-list">
          {binItems.map((item) => (
            <article key={item.id} className={`history-card status-${item.status.toLowerCase()}`}>
              <div>
                <span className="history-status">{STATUS_LABELS[item.status] || item.status}</span>
                <h2>Mục đích: {item.purpose || 'Không có thông tin'}</h2>
                <p>Đối tượng: {item.audience || 'Không có thông tin'}</p>
                <p>Đã xóa: {new Date(item.deleted_at).toLocaleString()}</p>
                {item.error_message && <p className="history-item-error">{item.error_message}</p>}
              </div>
              <div className="history-card-actions">
                <button onClick={() => handleRestore(item.id)}>Khôi phục</button>
                <button className="danger" onClick={() => handleHardDelete(item.id)}>Xóa vĩnh viễn</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {resultModal && (
        <div className="history-modal-backdrop" onClick={() => setResultModal(null)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{resultModal.purpose || 'Kết quả'}</h2>
              <button onClick={() => setResultModal(null)}>Đóng</button>
            </header>
            <pre>{resultModal.result?.full_master_prompt || 'Không có kết quả'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
