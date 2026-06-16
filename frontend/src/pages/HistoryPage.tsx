/**
 * HistoryPage — Trang lịch sử, quản lý draft và thùng rác
 *
 * Tab system: Tất cả / Hoàn thành / Bản nháp / Thất bại → gọi historyAPI.
 * Tab Thùng rác → gọi binAPI riêng biệt (dữ liệu khác schema so với history).
 *
 * Anti-race-condition: biến `isCurrentRequest` trong useEffect đảm bảo response
 * cũ không ghi đè state mới khi người dùng chuyển tab nhanh trước khi fetch xong.
 *
 * Soft-delete vs Hard-delete:
 *   - handleDelete    → soft-delete, item vào thùng rác, có thể khôi phục.
 *   - handleHardDelete → xóa vĩnh viễn khỏi DB, không hoàn tác được.
 *   - handleEmptyBin  → hard-delete toàn bộ thùng rác cùng lúc.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { binAPI, BinItem, draftAPI, historyAPI, HistoryItem, JobResult } from '../services/api'
import { ThemeToggle } from '../components/ThemeToggle'
import './HistoryPage.css'

type HistoryTab = 'ALL' | 'COMPLETED' | 'DRAFT' | 'FAILED' | 'BIN'

const TABS: Array<{ key: HistoryTab; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'COMPLETED', label: 'Hoàn thành' },
  { key: 'DRAFT', label: 'Bản nháp' },
  { key: 'FAILED', label: 'Thất bại' },
]

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Hoàn thành',
  DRAFT: 'Bản nháp',
  FAILED: 'Thất bại',
}

const PAGE_SIZE = 10

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
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  // mutatingId lưu id của item đang trong quá trình xóa/khôi phục để disable đúng nút đó,
  // thay vì lock toàn bộ trang — UX tốt hơn khi có nhiều item trên màn hình.
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [isEmptyingBin, setIsEmptyingBin] = useState(false)

  const isBinTab = activeTab === 'BIN'
  const visibleCount = isBinTab ? binItems.length : items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const offset = (currentPage - 1) * PAGE_SIZE

  const getErrorMessage = (err: any, fallback: string) => err.response?.data?.detail || fallback

  // Tải lại danh sách mỗi khi tab, trang, hoặc refreshKey thay đổi.
  // refreshKey được bump sau mutation (xóa/khôi phục) thay vì lưu full list trong state —
  // tránh phải sync local state với server, đơn giản hóa logic đáng kể.
  useEffect(() => {
    let isCurrentRequest = true  // guard: bỏ qua response nếu effect đã cleanup (tab đổi)

    const loadHistory = async () => {
      setIsLoading(true)
      setError('')
      try {
        if (activeTab === 'BIN') {
          const res = await binAPI.getBin(PAGE_SIZE, offset)
          if (!isCurrentRequest) return
          setBinItems(res.data.items)
          setItems([])
          setTotalItems(res.data.total)
        } else {
          const filter = activeTab === 'ALL' ? undefined : activeTab
          const res = await historyAPI.getHistory(filter, PAGE_SIZE, offset)
          if (!isCurrentRequest) return
          setItems(res.data.items)
          setBinItems([])
          setTotalItems(res.data.total)
        }
      } catch (err: any) {
        // getErrorMessage trích xuất err.response?.data?.detail từ Axios error object
        if (isCurrentRequest) {
          setError(getErrorMessage(err, 'Không tải được lịch sử'))
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoading(false)
        }
      }
    }

    loadHistory()

    return () => {
      isCurrentRequest = false
    }
  }, [activeTab, offset, refreshKey])

  // Clamp currentPage khi totalItems giảm (ví dụ: xóa item cuối của trang cuối).
  // Không xử lý trong refreshAfterMutation vì totalItems cập nhật async sau fetch.
  useEffect(() => {
    const nextTotalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
    if (currentPage > nextTotalPages) {
      setCurrentPage(nextTotalPages)
    }
  }, [currentPage, totalItems])

  // Sau khi xóa/khôi phục: nếu item vừa xóa là item duy nhất trên trang (không phải trang 1),
  // lùi về trang trước thay vì hiện trang trống. Ngược lại, bump refreshKey để re-fetch.
  const refreshAfterMutation = () => {
    if (visibleCount === 1 && currentPage > 1) {
      setCurrentPage((page) => page - 1)
    } else {
      setRefreshKey((key) => key + 1)
    }
  }

  const handleDelete = async (id: string) => {
    setMutatingId(id)
    setError('')
    try {
      await historyAPI.softDelete(id)
      refreshAfterMutation()
    } catch (err: any) {
      setError(getErrorMessage(err, 'Xóa mục thất bại. Vui lòng thử lại.'))
    } finally {
      setMutatingId(null)
    }
  }

  const handleRestore = async (id: string) => {
    setMutatingId(id)
    setError('')
    try {
      await binAPI.restore(id)
      refreshAfterMutation()
    } catch (err: any) {
      setError(getErrorMessage(err, 'Khôi phục mục thất bại. Vui lòng thử lại.'))
    } finally {
      setMutatingId(null)
    }
  }

  const handleHardDelete = async (id: string) => {
    if (!confirm('Xóa vĩnh viễn mục này? Hành động này không thể hoàn tác.')) return
    setMutatingId(id)
    setError('')
    try {
      await binAPI.hardDelete(id)
      refreshAfterMutation()
    } catch (err: any) {
      setError(getErrorMessage(err, 'Xóa vĩnh viễn thất bại. Vui lòng thử lại.'))
    } finally {
      setMutatingId(null)
    }
  }

  const handleEmptyBin = async () => {
    if (!confirm('Xóa vĩnh viễn tất cả mục trong thùng rác? Hành động này không thể hoàn tác.')) return
    setIsEmptyingBin(true)
    setError('')
    try {
      await binAPI.emptyBin()
      setBinItems([])
      setTotalItems(0)
      setCurrentPage(1)
    } catch (err: any) {
      setError(getErrorMessage(err, 'Dọn sạch thùng rác thất bại. Vui lòng thử lại.'))
    } finally {
      setIsEmptyingBin(false)
    }
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

  const handleTabChange = (tab: HistoryTab) => {
    setCurrentPage(1)
    setActiveTab(tab)
  }

  const handleBinToggle = () => {
    setCurrentPage(1)
    setActiveTab(isBinTab ? 'ALL' : 'BIN')
  }

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)
    setCurrentPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <h1>{isBinTab ? 'Thùng rác' : 'Lịch sử Prompt'}</h1>
          <p>
            {isBinTab
              ? 'Khôi phục hoặc xóa vĩnh viễn các mục đã xóa.'
              : 'Xem lại prompt đã tạo, bản nháp và lần tạo thất bại.'}
          </p>
        </div>
        <div className="history-actions">
          <ThemeToggle />

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
            <button
              type="button"
              className="danger"
              onClick={handleEmptyBin}
              disabled={isEmptyingBin}
            >
              {isEmptyingBin ? 'Đang dọn...' : 'Dọn sạch thùng rác'}
            </button>
          )}
        </div>
      </header>

      {!isBinTab && (
        <nav className="history-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

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
                <div className="history-card-meta">
                  <span>
                    <strong>Mục đích:</strong> {item.purpose || 'Không có thông tin'}
                  </span>
                  <span>
                    <strong>Đối tượng:</strong> {item.audience || 'Không có thông tin'}
                  </span>
                </div>
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
                <button className="danger" onClick={() => handleDelete(item.id)} disabled={mutatingId === item.id}>
                  {mutatingId === item.id ? 'Đang xóa...' : 'Xóa'}
                </button>
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
                <div className="history-card-meta">
                  <span>
                    <strong>Mục đích:</strong> {item.purpose || 'Không có thông tin'}
                  </span>
                  <span>
                    <strong>Đối tượng:</strong> {item.audience || 'Không có thông tin'}
                  </span>
                </div>
                <p>Đã xóa: {new Date(item.deleted_at).toLocaleString()}</p>
                {item.error_message && <p className="history-item-error">{item.error_message}</p>}
              </div>
              <div className="history-card-actions">
                <button onClick={() => handleRestore(item.id)} disabled={mutatingId === item.id}>
                  {mutatingId === item.id ? 'Đang xử lý...' : 'Khôi phục'}
                </button>
                <button className="danger" onClick={() => handleHardDelete(item.id)} disabled={mutatingId === item.id}>
                  {mutatingId === item.id ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalItems > PAGE_SIZE && (
        <nav className="history-pagination" aria-label="Phân trang lịch sử">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1 || isLoading}>
            Trước
          </button>
          <span>
            Trang {currentPage} / {totalPages} - {totalItems} mục
          </span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages || isLoading}>
            Sau
          </button>
        </nav>
      )}

      <button
        type="button"
        className={`history-bin-fab ${isBinTab ? 'active' : ''}`}
        onClick={handleBinToggle}
        aria-label={isBinTab ? 'Quay lại lịch sử' : 'Mở thùng rác'}
        title={isBinTab ? 'Quay lại lịch sử' : 'Thùng rác'}
      >
        {isBinTab ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7.6A9 9 0 1 1 3 12"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path d="M4 3.8v3.8h3.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7.8v4.8l3.2 1.9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="1.25" fill="currentColor" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        )}
      </button>

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
