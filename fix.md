# Danh sach viec can sua

File nay tong hop cac diem can sua tiep cho nhom history/draft/bin sau khi da them pagination, parse `input_payload` mot lan, doi `HISTORY_VISIBLE_STATUSES` va chuan hoa mot so message.

## Da sua

- `GET /api/history` va `GET /api/bin` da co `limit` va `offset`.
- `to_history_item()` va `to_bin_item()` da parse `input_payload` mot lan.
- Da xoa `extract_purpose()` va `extract_audience()` vi khong con dung.
- Da doi `VISIBLE_STATUSES` thanh `HISTORY_VISIBLE_STATUSES`.
- `HISTORY_VISIBLE_STATUSES` da lay gia tri tu `JobStatus` thay vi hard-code string.
- Da chuan hoa mot so message tra ve API sang tieng Viet ro hon.

## Can sua tiep

### 1. Chuan hoa status schema sang `JobStatus`

Hien tai `HistoryItemResponse.status` trong `backend/schemas/jobs.py` va `BinItemResponse.status` trong `backend/schemas/bin.py` van la `str`.

Nen doi thanh `JobStatus` de response schema chat hon:

```python
class HistoryItemResponse(BaseModel):
    id: str
    status: JobStatus
    ...
```

```python
class BinItemResponse(BaseModel):
    id: str
    status: JobStatus
    ...
```

Ly do:

- History va bin deu tra ve trang thai cua `Job`.
- Trang thai hop le da duoc dinh nghia trong `JobStatus`.
- Neu database co status sai, Pydantic se bao loi thay vi tra du lieu khong hop le.
- Schema backend nhat quan hon voi type `JobStatus` o frontend.

### 2. Bo hard-code `status="DRAFT"` trong draft router

Trong `backend/api/draft_router.py`, khi tao draft dang dung:

```python
status="DRAFT"
```

Nen doi thanh:

```python
status=JobStatus.DRAFT.value
```

Can import:

```python
from schemas.jobs import HistoryItemResponse, JobStatus, SaveDraftRequest
```

Ly do:

- Tranh go sai string.
- Tat ca status deu di qua `JobStatus`.
- De refactor khi them/doi trang thai job.

### 3. Bo hard-code `Job.status == "DRAFT"` trong service

Trong `backend/services/job_history_service.py`, `get_owned_draft()` dang filter:

```python
Job.status == "DRAFT"
```

Nen doi thanh:

```python
Job.status == JobStatus.DRAFT.value
```

Ly do:

- Nhat quan voi `HISTORY_VISIBLE_STATUSES`.
- Tranh string literal rari rac trong code.

### 4. Can nhac doi `GenerateResponse.status` va `JobStatusResponse.status`

Trong `backend/schemas/jobs.py`:

```python
class GenerateResponse(BaseModel):
    status: str = "PENDING"

class JobStatusResponse(BaseModel):
    status: str
```

Nen can nhac doi thanh:

```python
class GenerateResponse(BaseModel):
    status: JobStatus = JobStatus.PENDING

class JobStatusResponse(BaseModel):
    status: JobStatus
```

Ly do:

- Tat ca response lien quan job deu dung cung enum.
- Giam nguy co tra status ngoai tap hop hop le.

Luu y: can kiem tra frontend co xu ly enum string binh thuong khong. Vi `JobStatus` ke thua `str`, JSON response van la string nhu `"PENDING"`, `"COMPLETED"`.

### 5. Tach helper serialize/deserialize draft payload

Trong `backend/api/draft_router.py`, logic serialize draft dang lap lai:

```python
json.dumps(data.model_dump(), ensure_ascii=False)
```

Nen tach helper:

```python
def dump_draft_payload(data: SaveDraftRequest) -> str:
    return json.dumps(data.model_dump(), ensure_ascii=False)
```

Va helper doc draft:

```python
def load_draft_payload(raw: str) -> dict:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Du lieu ban nhap khong hop le.",
        )
    return payload
```

Ly do:

- Giam duplicate.
- De test rieng logic draft payload.
- Router gon hon.

### 6. Cai tien pagination response neu frontend can phan trang day du

Hien tai `/history` va `/bin` tra ve list truc tiep:

```json
[
  { "id": "...", "status": "COMPLETED" }
]
```

Neu frontend can hien tong so trang, nen doi sang response wrapper:

```json
{
  "items": [],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

Ly do:

- Frontend biet con trang tiep theo hay khong.
- De lam UI pagination dung hon.

Luu y: day la thay doi API contract, can sua frontend di kem. Neu chua can UI pagination day du, co the de sau.

### 7. Them automated test cho cac case rui ro

Nen them test trong `backend/tests/`, vi cac API nay lien quan quyen so huu du lieu.

Case nen co:

- User A khong doc duoc draft cua User B.
- User A khong xoa mem history cua User B.
- User A khong restore item trong bin cua User B.
- User A khong hard-delete item trong bin cua User B.
- `/history?status=INVALID` tra 400.
- `/history?limit=10&offset=0` tra dung so item.
- `/bin?limit=10&offset=0` tra dung so item.
- Draft co `input_payload` khong phai JSON hop le tra loi ro rang.

Ly do:

- Bao ve cac rule security quan trong.
- Tranh regression khi sua router/service.
- Giam viec test thu cong.

## Thu tu uu tien de lam tiep

1. Doi tat ca status response lien quan job sang `JobStatus`.
2. Bo hard-code `"DRAFT"` trong router/service.
3. Tach helper draft payload.
4. Viet test ownership va pagination.
5. Chi doi pagination response wrapper neu frontend that su can.
