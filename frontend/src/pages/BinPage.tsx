import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { binAPI, BinItem } from '../services/api'
import './HistoryPage.css'

export function BinPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<BinItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadBin = async () => {
      setIsLoading(true)
      setError('')
      try {
        const res = await binAPI.getBin()
        setItems(res.data.items)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Khong tai duoc thung rac')
      } finally {
        setIsLoading(false)
      }
    }

    loadBin()
  }, [])

  const handleRestore = async (id: string) => {
    await binAPI.restore(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleHardDelete = async (id: string) => {
    if (!confirm('Xoa vinh vien muc nay? Khong the hoan tac.')) return
    await binAPI.hardDelete(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleEmptyBin = async () => {
    if (!confirm('Xoa vinh vien tat ca? Khong the hoan tac.')) return
    await binAPI.emptyBin()
    setItems([])
  }

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <h1>Thung rac</h1>
          <p>Khoi phuc hoac xoa vinh vien cac muc da xoa.</p>
        </div>
        <div className="history-actions">
          <button onClick={() => navigate('/history')}>Quay lai lich su</button>
          {items.length > 0 && <button className="danger" onClick={handleEmptyBin}>Don sach</button>}
        </div>
      </header>

      {error && <div className="history-error">{error}</div>}
      {isLoading && <div className="history-empty">Dang tai...</div>}

      {!isLoading && items.length === 0 && (
        <div className="history-empty">
          <p>Thung rac trong.</p>
          <button onClick={() => navigate('/history')}>Quay lai lich su</button>
        </div>
      )}

      <div className="history-list">
        {items.map((item) => (
          <article key={item.id} className={`history-card status-${item.status.toLowerCase()}`}>
            <div>
              <span className="history-status">{item.status}</span>
              <h2>{item.purpose || 'Khong co tieu de'}</h2>
              <p>Da xoa: {new Date(item.deleted_at).toLocaleString()}</p>
              {item.error_message && <p className="history-item-error">{item.error_message}</p>}
            </div>
            <div className="history-card-actions">
              <button onClick={() => handleRestore(item.id)}>Khoi phuc</button>
              <button className="danger" onClick={() => handleHardDelete(item.id)}>Xoa vinh vien</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
