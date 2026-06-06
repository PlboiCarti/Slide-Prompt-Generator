# Bàn giao: Đổi response pagination cho History và Bin

## 1. Bối cảnh

Hiện tại hai API danh sách:

- `GET /api/history`
- `GET /api/bin`

đã nhận tham số phân trang `limit` và `offset`, nhưng response vẫn là một mảng trực tiếp:

```json
[
  {
    "id": "...",
    "status": "COMPLETED"
  }
]
```

Cách trả này chỉ đủ để hiển thị danh sách đơn giản. Frontend không biết tổng số item là bao nhiêu, có còn trang tiếp theo hay không, và cũng không có metadata để hiển thị pagination đầy đủ.

Mục tiêu của thay đổi này là đổi response sang dạng wrapper:

```json
{
  "items": [],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

Trong đó:

- `items`: danh sách item của trang hiện tại.
- `total`: tổng số item khớp với bộ lọc hiện tại.
- `limit`: số item tối đa backend trả về trong một lần gọi.
- `offset`: vị trí bắt đầu lấy dữ liệu.

Đây là thay đổi API contract, nên backend và frontend phải sửa cùng nhau.

## 2. Bối cảnh UI và hiệu suất

Trong thực tế, không nên hiển thị toàn bộ lịch sử hoặc toàn bộ thùng rác trên một màn hình nếu số lượng item tăng lên. Khi danh sách có nhiều bản ghi, UI sẽ trở nên quá dài, khó quét thông tin, thao tác kém thuận tiện và trải nghiệm người dùng sẽ giảm.

Với màn hình history/bin hiện tại, mỗi item được hiển thị dạng card và có nhiều thông tin như trạng thái, mục đích, đối tượng, thời gian cập nhật hoặc thời gian xóa, cùng các nút thao tác. Nếu render quá nhiều card cùng lúc, bố cục sẽ rối và không còn phù hợp cho một màn hình demo có giao diện rõ ràng.

Vì vậy, nên giới hạn số item hiển thị mỗi trang. Đề xuất mặc định là **10 item/trang**. Con số này đủ để người dùng xem nhanh danh sách, đồng thời vẫn giữ giao diện gọn, dễ đọc và dễ thao tác.

Pagination cũng giúp tránh ảnh hưởng hiệu suất khi dữ liệu tăng dần:

- Backend không cần trả toàn bộ history/bin trong một request.
- Frontend không cần render quá nhiều card cùng lúc.
- Response API nhỏ hơn, tải nhanh hơn.
- Giao diện ổn định hơn khi số lượng job tăng lên theo thời gian.

Do đó, việc đổi response sang dạng pagination wrapper không chỉ để có `total`, `limit`, `offset`, mà còn để hỗ trợ cách hiển thị hợp lý hơn: mỗi lần chỉ lấy và hiển thị một phần nhỏ dữ liệu, mặc định là 10 item/trang.

Ngoài ra, frontend hiện tại chỉ dùng cho demo, nhưng vẫn nên chỉnh màu trạng thái cho dễ nhìn. Trạng thái `DRAFT` nên dùng màu vàng để người dùng phân biệt nhanh với các trạng thái khác như hoàn thành hoặc thất bại.

## 3. Chức năng sau khi hoàn thành

Sau khi sửa, frontend có thể gọi:

```http
GET /api/history?limit=10&offset=0
```

Response:

```json
{
  "items": [
    {
      "id": "job_1",
      "status": "COMPLETED",
      "created_at": "2026-05-30T10:00:00",
      "updated_at": "2026-05-30T10:05:00",
      "purpose": "Tạo slide bán hàng",
      "audience": "Đội sales",
      "has_result": true,
      "error_message": null
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

Nếu lọc theo trạng thái:

```http
GET /api/history?status=DRAFT&limit=10&offset=0
```

`total` phải là tổng số draft của user hiện tại, không phải tổng tất cả history.

Tương tự với thùng rác:

```http
GET /api/bin?limit=10&offset=0
```

Response:

```json
{
  "items": [
    {
      "id": "job_2",
      "status": "FAILED",
      "purpose": "Tạo proposal",
      "audience": "Khách hàng B2B",
      "has_result": false,
      "error_message": "Có lỗi khi xử lý.",
      "deleted_at": "2026-05-30T11:00:00",
      "created_at": "2026-05-30T10:30:00"
    }
  ],
  "total": 8,
  "limit": 10,
  "offset": 0
}
```

## 4. Bố cục schema mong muốn

### 4.1. Tạo file `backend/schemas/history.py`

File này gom các schema thuộc nhóm history/draft:

- `HistoryItemResponse`
- `SaveDraftRequest`
- `PaginatedHistoryResponse`

Dự kiến nội dung:

```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from schemas.jobs import JobStatus


class HistoryItemResponse(BaseModel):
    """Bản ghi rút gọn hiển thị cho /history và item vừa khôi phục từ thùng rác."""
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    purpose: str | None = None
    audience: str | None = None
    has_result: bool = False
    error_message: str | None = None


class PaginatedHistoryResponse(BaseModel):
    """Response dạng phân trang cho /history."""
    items: list[HistoryItemResponse]
    total: int
    limit: int
    offset: int


class SaveDraftRequest(BaseModel):
    purpose: str
    audience: str
    style: str
    primary_color: str
    slide_count: int
    primary_layout: str
    content: str
    language: str
    description: dict[str, Any] | None = None
```

### 4.2. Cập nhật file `backend/schemas/bin.py`

File này tiếp tục chứa schema thuộc thùng rác:

- `BinItemResponse`
- `PaginatedBinResponse`

Thêm:

```python
class PaginatedBinResponse(BaseModel):
    """Response dạng phân trang cho /bin."""
    items: list[BinItemResponse]
    total: int
    limit: int
    offset: int
```

### 4.3. Dọn file `backend/schemas/jobs.py`

Sau khi chuyển schema history/draft sang `schemas/history.py`, file `jobs.py` chỉ nên giữ các schema liên quan trực tiếp tới vòng đời job:

- `JobStatus`
- `GenerateResponse`
- `JobStatusResponse`

Cần xóa khỏi `jobs.py`:

- `HistoryItemResponse`
- `SaveDraftRequest`

Lý do: `HistoryItemResponse` và `SaveDraftRequest` thuộc nhóm history/draft, không phải response poll job chung.

## 5. Backend cần sửa

### 5.1. Sửa import

Tìm các nơi đang import `HistoryItemResponse` hoặc `SaveDraftRequest` từ `schemas.jobs`.

Lệnh gợi ý:

```powershell
rg -n "HistoryItemResponse|SaveDraftRequest|PaginatedHistoryResponse|PaginatedBinResponse" backend
```

Các file cần chú ý:

- `backend/api/history_router.py`
- `backend/api/draft_router.py`
- `backend/services/job_history_service.py`

Ví dụ đổi:

```python
from schemas.jobs import HistoryItemResponse, JobStatus, SaveDraftRequest
```

thành:

```python
from schemas.history import HistoryItemResponse, SaveDraftRequest
from schemas.jobs import JobStatus
```

Trong `history_router.py`, cần import:

```python
from schemas.bin import BinItemResponse, PaginatedBinResponse
from schemas.history import HistoryItemResponse, PaginatedHistoryResponse
```

### 5.2. Đổi `/api/history`

Trong `backend/api/history_router.py`, đổi:

```python
@router.get("/history", response_model=list[HistoryItemResponse])
```

thành:

```python
@router.get("/history", response_model=PaginatedHistoryResponse)
```

Logic hiện tại đang build `query`, rồi lấy:

```python
jobs = query.order_by(Job.updated_at.desc()).offset(offset).limit(limit).all()
return [to_history_item(job) for job in jobs]
```

Cần đổi thành:

```python
total = query.count()
jobs = query.order_by(Job.updated_at.desc()).offset(offset).limit(limit).all()

return {
    "items": [to_history_item(job) for job in jobs],
    "total": total,
    "limit": limit,
    "offset": offset,
}
```

Điểm quan trọng:

- `query` phải đã filter theo `current_user.id`.
- `query` phải đã filter `Job.deleted_at.is_(None)`.
- `query` phải đã filter `Job.status.in_(HISTORY_VISIBLE_STATUSES)`.
- Nếu có `status_filter`, `query` phải đã filter thêm `Job.status == normalized_status`.
- `total = query.count()` phải chạy trước khi áp dụng `offset` và `limit`.

### 5.3. Đổi `/api/bin`

Trong `backend/api/history_router.py`, đổi:

```python
@router.get("/bin", response_model=list[BinItemResponse])
```

thành:

```python
@router.get("/bin", response_model=PaginatedBinResponse)
```

Nên tách query ra biến riêng để vừa count vừa lấy items:

```python
query = db.query(Job).filter(
    Job.user_id == current_user.id,
    Job.deleted_at.isnot(None),
)

total = query.count()
jobs = query.order_by(Job.deleted_at.desc()).offset(offset).limit(limit).all()

return {
    "items": [to_bin_item(job) for job in jobs],
    "total": total,
    "limit": limit,
    "offset": offset,
}
```

Điểm quan trọng:

- `/bin` chỉ được count item đã xóa mềm của user hiện tại.
- Không count item active trong history.
- Không count item của user khác.

## 6. Frontend cần sửa

### 6.1. Thêm type wrapper

Trong `frontend/src/services/api.ts`, thêm:

```ts
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
```

### 6.2. Đổi `historyAPI.getHistory`

Hiện tại:

```ts
getHistory: (statusFilter?: string) =>
  api.get<HistoryItem[]>('/history', {
    params: statusFilter ? { status: statusFilter } : undefined,
  }),
```

Đổi thành:

```ts
getHistory: (statusFilter?: string, limit = 10, offset = 0) =>
  api.get<PaginatedResponse<HistoryItem>>('/history', {
    params: {
      ...(statusFilter ? { status: statusFilter } : {}),
      limit,
      offset,
    },
  }),
```

### 6.3. Đổi `binAPI.getBin`

Hiện tại:

```ts
getBin: () => api.get<BinItem[]>('/bin'),
```

Đổi thành:

```ts
getBin: (limit = 10, offset = 0) =>
  api.get<PaginatedResponse<BinItem>>('/bin', {
    params: { limit, offset },
  }),
```

### 6.4. Đổi nơi đọc response

Trong `frontend/src/pages/HistoryPage.tsx`, hiện tại đang dùng response là array:

```ts
setBinItems(res.data)
setItems(res.data)
```

Cần đổi thành:

```ts
setBinItems(res.data.items)
setItems(res.data.items)
```

Trong `frontend/src/pages/BinPage.tsx`, hiện tại:

```ts
setItems(res.data)
```

Cần đổi thành:

```ts
setItems(res.data.items)
```

Nếu chưa làm UI nút trang, chỉ đổi sang `res.data.items` là đủ để app không vỡ.

### 6.5. Đổi màu trạng thái Draft sang vàng

Frontend hiện tại chỉ là demo, nhưng trạng thái `DRAFT` nên có màu riêng để dễ nhận biết. Cần chỉnh CSS ở file đang style card history/bin, hiện là:

- `frontend/src/pages/HistoryPage.css`

Tìm class trạng thái tương ứng với card draft. Do card đang render class theo status:

```tsx
className={`history-card status-${item.status.toLowerCase()}`}
```

với `DRAFT` sẽ thành:

```css
.status-draft
```

Cần thêm hoặc chỉnh CSS để Draft có màu vàng. Ví dụ:

```css
.history-card.status-draft {
  border-color: #f2c94c;
  background: #fff8df;
}

.history-card.status-draft .history-status {
  background: #f2c94c;
  color: #3a2a00;
}
```

Màu có thể chỉnh theo design hiện tại, nhưng yêu cầu là Draft phải đọc ra là màu vàng, khác rõ với Completed và Failed.

### 6.6. Chỉnh bố cục Mục đích và Đối tượng trên card

Hiện tại card history/bin đang hiển thị `Mục đích` và `Đối tượng` thành hai dòng riêng:

```tsx
<h2>Mục đích: {item.purpose || 'Không có thông tin'}</h2>
<p>Đối tượng: {item.audience || 'Không có thông tin'}</p>
```

Yêu cầu mới: `Mục đích` và `Đối tượng` nên nằm chung một hàng, cùng in đậm như nhau, và cách nhau bằng khoảng phù hợp để card gọn hơn.

Đề xuất sửa JSX trong `frontend/src/pages/HistoryPage.tsx` ở cả phần history và bin:

```tsx
<div className="history-card-meta">
  <span>
    <strong>Mục đích:</strong> {item.purpose || 'Không có thông tin'}
  </span>
  <span>
    <strong>Đối tượng:</strong> {item.audience || 'Không có thông tin'}
  </span>
</div>
```

Sau đó phần thời gian vẫn để dòng riêng:

```tsx
<p>Cập nhật: {new Date(item.updated_at).toLocaleString()}</p>
```

hoặc với bin:

```tsx
<p>Đã xóa: {new Date(item.deleted_at).toLocaleString()}</p>
```

Cần thêm CSS trong `frontend/src/pages/HistoryPage.css`:

```css
.history-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  align-items: center;
  font-weight: 600;
}

.history-card-meta span {
  min-width: 0;
}
```

Lý do dùng `flex-wrap` là để nếu nội dung dài hoặc màn hình nhỏ, hai phần có thể tự xuống dòng thay vì bị tràn khỏi card.

Nếu muốn cả label và value đều in đậm như nhau, có thể dùng:

```css
.history-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  align-items: center;
  font-weight: 700;
}
```

Khuyến nghị dùng `font-weight: 600` để đủ nổi bật nhưng không làm card quá nặng về thị giác.

## 7. UI pagination đầy đủ nếu muốn làm luôn

Phần này không bắt buộc để hoàn thành contract backend, nhưng là lý do chính để có `total`.

Có thể thêm state trong `HistoryPage.tsx`:

```ts
const [total, setTotal] = useState(0)
const [offset, setOffset] = useState(0)
const limit = 10
```

Khi gọi API:

```ts
const res = await historyAPI.getHistory(filter, limit, offset)
setItems(res.data.items)
setTotal(res.data.total)
```

Tính trạng thái nút:

```ts
const hasPrevPage = offset > 0
const hasNextPage = offset + visibleCount < total
```

Khi đổi tab, nên reset:

```ts
setOffset(0)
```

Với tab thùng rác trong `HistoryPage`, nếu dùng chung state `total/offset`, cần cẩn thận vì `items` và `binItems` là hai danh sách khác nhau.

Có thể làm đơn giản trước:

- Chỉ đổi response wrapper.
- Chưa thêm nút Next/Prev.
- Sau đó mở task riêng cho UI pagination.

## 8. Thứ tự thực hiện khuyến nghị

1. Tạo `backend/schemas/history.py`.
2. Chuyển `HistoryItemResponse` và `SaveDraftRequest` từ `backend/schemas/jobs.py` sang `backend/schemas/history.py`.
3. Thêm `PaginatedHistoryResponse` vào `backend/schemas/history.py`.
4. Thêm `PaginatedBinResponse` vào `backend/schemas/bin.py`.
5. Dọn `backend/schemas/jobs.py`, chỉ giữ schema job lifecycle.
6. Sửa import backend ở router/service.
7. Đổi `/api/history` sang response wrapper.
8. Đổi `/api/bin` sang response wrapper.
9. Thêm `PaginatedResponse<T>` trong frontend `api.ts`.
10. Đổi type response của `historyAPI.getHistory` và `binAPI.getBin`.
11. Đổi các page frontend từ `res.data` sang `res.data.items`.
12. Đổi màu trạng thái `DRAFT` sang vàng trong CSS frontend.
13. Chỉnh `Mục đích` và `Đối tượng` nằm chung một hàng trên card, cùng độ đậm và có khoảng cách phù hợp.
14. Chạy kiểm tra backend/frontend.

## 9. Cách kiểm tra

### 9.1. Kiểm tra compile backend

```powershell
python -m compileall backend
```

Mục tiêu:

- Không còn lỗi import từ `schemas.jobs`.
- Không còn lỗi schema chưa định nghĩa.

### 9.2. Kiểm tra build frontend

```powershell
npm run build
```

Nếu đang ở root repo và frontend nằm trong thư mục `frontend`, cần chạy đúng theo cấu trúc dự án hiện tại.

Mục tiêu:

- TypeScript không báo lỗi `res.data` không phải array.
- Không còn nơi nào dùng `HistoryItem[]` hoặc `BinItem[]` cho response list mới.

### 9.3. Kiểm tra thủ công API

Gọi:

```http
GET /api/history?limit=10&offset=0
```

Kỳ vọng:

```json
{
  "items": [],
  "total": 0,
  "limit": 10,
  "offset": 0
}
```

Gọi:

```http
GET /api/bin?limit=10&offset=0
```

Kỳ vọng response cũng có đủ:

- `items`
- `total`
- `limit`
- `offset`

### 9.4. Kiểm tra các case quan trọng

- `/api/history?status=INVALID` vẫn phải trả `400`.
- `/api/history?status=DRAFT&limit=10&offset=0` chỉ trả draft.
- `/api/history?limit=1&offset=0` trả tối đa 1 item nhưng `total` vẫn là tổng đầy đủ.
- `/api/bin?limit=1&offset=0` trả tối đa 1 item nhưng `total` vẫn là tổng item trong thùng rác.
- User A không thấy history/bin của User B.
- Card có trạng thái `DRAFT` hiển thị màu vàng trên frontend.
- Trên card history/bin, `Mục đích` và `Đối tượng` nằm cùng một hàng ở màn hình đủ rộng, cùng độ đậm, không bị dính sát nhau.
- Ở màn hình nhỏ hoặc nội dung dài, `Mục đích` và `Đối tượng` được phép xuống dòng nhưng không tràn khỏi card.

## 10. Rủi ro cần lưu ý

### 10.1. Breaking change response

Trước đây frontend nhận:

```ts
HistoryItem[]
```

Sau thay đổi frontend nhận:

```ts
{
  items: HistoryItem[]
  total: number
  limit: number
  offset: number
}
```

Nếu bỏ sót chỗ nào còn `.map()` trực tiếp trên `res.data`, UI sẽ lỗi.

### 10.2. Sai `total`

`total` phải count cùng filter với danh sách item. Ví dụ đang lọc `status=DRAFT` thì `total` phải là tổng draft, không phải tổng tất cả history.

### 10.3. Sai import sau khi tách schema

Sau khi chuyển `HistoryItemResponse` và `SaveDraftRequest` sang `schemas/history.py`, các import cũ từ `schemas.jobs` sẽ lỗi.

Nên dùng:

```powershell
rg -n "from schemas.jobs import .*HistoryItemResponse|from schemas.jobs import .*SaveDraftRequest" backend
```

để kiểm tra còn import cũ hay không.

### 10.4. Tên file và trách nhiệm schema

Không tạo `history_pagination.py` vì tên này quá hẹp nhưng lại dễ chứa cả draft/bin. Hướng đã thống nhất:

- `schemas/history.py`: history và draft.
- `schemas/bin.py`: bin.
- `schemas/jobs.py`: job lifecycle.

### 10.5. Không đồng nhất `limit` mặc định

Backend và frontend nên cùng dùng mặc định 10 item/trang. Nếu backend mặc định 20 nhưng frontend mặc định 10, chức năng vẫn chạy nếu frontend luôn gửi `limit=10`, nhưng dễ gây nhầm khi gọi API thủ công hoặc khi có nơi khác gọi API mà không truyền `limit`.

Khuyến nghị đổi default backend:

```python
limit: int = Query(10, ge=1, le=100)
```

và frontend:

```ts
limit = 10
```

## 11. Tiêu chí hoàn thành

Task được coi là hoàn thành khi:

- `GET /api/history` trả object có `items`, `total`, `limit`, `offset`.
- `GET /api/bin` trả object có `items`, `total`, `limit`, `offset`.
- Mặc định mỗi request danh sách lấy 10 item/trang nếu frontend không chọn giá trị khác.
- Frontend hiển thị history như cũ, không lỗi vì response không còn là array.
- Frontend hiển thị bin như cũ, không lỗi vì response không còn là array.
- Card trạng thái `DRAFT` có màu vàng rõ ràng trên frontend.
- `Mục đích` và `Đối tượng` trên card nằm chung một hàng khi đủ không gian, cùng in đậm và có khoảng cách hợp lý.
- `HistoryItemResponse` và `SaveDraftRequest` đã nằm trong `backend/schemas/history.py`.
- `PaginatedHistoryResponse` nằm trong `backend/schemas/history.py`.
- `PaginatedBinResponse` nằm trong `backend/schemas/bin.py`.
- `backend/schemas/jobs.py` không còn chứa schema history/draft.
- `python -m compileall backend` chạy thành công.
- `npm run build` chạy thành công.
