# Báo cáo lỗi — Code Review (2026-05-28)

Danh sách lỗi được phát hiện qua review diff 5 commit gần nhất (`HEAD~5...HEAD`).
Xếp theo mức độ nghiêm trọng giảm dần.

---

## Lỗi #1 — `_split_batch` không có retry khi `_safe_parse` ném ValueError

**File:** `backend/services/llm_service.py` — hàm `_split_batch()` (~line 311)
**Mức độ:** 🔴 Cao

**Mô tả:**
`_safe_parse()` đã được đổi từ "trả về `{}` khi parse thất bại" sang "ném `ValueError`".
Tuy nhiên `_split_batch()` và `fill_slide_contents()` **không có decorator `@retry`** và **không có `try/except`** bao quanh lời gọi `_safe_parse()`.

**Hậu quả:**
Khi Gemini trả về JSON bị lỗi (mạng chập chờn, quota, response bị cắt ngắn) ở bước B3:
- `_safe_parse()` ném `ValueError`
- Ngoại lệ lan lên `_run_pipeline()` → job bị đánh dấu `FAILED`
- Kết quả B2 (cấu trúc slide đã sinh thành công) bị mất toàn bộ

**Hành vi cũ (trước diff):** `_safe_parse` trả về `{}` → `contents = []` → pad bằng chuỗi rỗng → job hoàn thành với content trống (degradation nhẹ, UX tốt hơn).

**Hành vi mới:** Job `FAILED` ngay lập tức, không retry. Trong khi đó `generate_slide_structure` (B2) đã có `@retry × 3` để bảo vệ.

**Cách sửa:**
```python
# Thêm @retry cho _split_batch, hoặc bọc _safe_parse trong try/except bên trong _split_batch:
try:
    parsed = _safe_parse(resp.text)
except ValueError:
    logger.warning("B3 _split_batch: JSON parse failed, returning empty contents")
    parsed = {}
```

---

## Lỗi #2 — `_safe_parse(None)` ném `TypeError` khi `resp.text` là `None`

**File:** `backend/services/llm_service.py` — hàm `_safe_parse()` (~line 530)
**Mức độ:** 🔴 Cao

**Mô tả:**
Code cũ có guard `if not raw: return {}`. Code mới xóa guard này.
Khi Gemini trả về response bị lọc (SAFETY / RECITATION finish reason), `resp.text` là `None` (hành vi có tài liệu của Google Generative AI SDK).

Dòng `_CODE_FENCE_RE.sub("", raw)` với `raw = None` ném:
```
TypeError: expected string or bytes-like object
```

**Hậu quả:**
- Trong `_split_batch` (không có `@retry`): `TypeError` lan thẳng lên worker → job `FAILED`
- Trong các hàm có `@retry`: tenacity retry đúng (retry mọi exception) nhưng log sai, root cause bị che giấu

**Cách sửa:**
```python
def _safe_parse(raw: str) -> dict:
    if not raw:
        raise ValueError("Gemini trả về response rỗng hoặc None")
    cleaned = _CODE_FENCE_RE.sub("", raw).strip()
    ...
```

---

## Lỗi #3 — `_recursive_summarize` không guard `resp.text` là `None`

**File:** `backend/services/llm_service.py` — hàm `_recursive_summarize()` (~line 339)
**Mức độ:** 🔴 Cao

**Mô tả:**
Khi user upload PDF lớn (>12,000 ký tự), `fill_slide_contents()` gọi `_recursive_summarize()`.
Hàm này chia content thành từng chunk và gọi Gemini cho mỗi chunk.
Nếu bất kỳ chunk nào kích hoạt bộ lọc SAFETY của Gemini, `resp.text` sẽ là `None`.

```python
summaries.append(resp.text.strip())           # AttributeError nếu resp.text là None
logger.info(f"... → {len(resp.text.strip())} ký tự")  # crash lần 2
```

Không có `@retry` hay `try/except` tại đây. `AttributeError` lan lên `_run_pipeline()` → job `FAILED`.

**Hậu quả:** Toàn bộ job thất bại chỉ vì 1 chunk bị lọc, dù các chunk còn lại hoàn toàn bình thường.

**Cách sửa:**
```python
text = resp.text or ""
summaries.append(text.strip())
logger.info(f"  chunk {i + 1}/{len(chunks)} summarized: {len(chunk)} → {len(text.strip())} ký tự")
```

---

## Lỗi #4 — `all(desc_fields.values())` im lặng bỏ qua toàn bộ mô tả khi 1 field trống

**File:** `backend/api/prompt_router.py` — hàm `generate()` (~line 119)
**Mức độ:** 🟠 Trung bình

**Mô tả:**
```python
if all(desc_fields.values()):  # chỉ dùng nếu đủ cả 5 field
    description_dict = desc_fields
```

Nếu user xem Phase 1, chỉnh sửa 4/5 field rồi vô tình xóa trắng 1 field (ví dụ `desc_visual`), frontend gửi `desc_visual=""`. Backend thấy `all(...)` = `False` → `description_dict` giữ nguyên `{}` → worker tự gọi lại `generate_design_description()` và **ghi đè toàn bộ** các chỉnh sửa của user.

**Hậu quả:** User mất hết chỉnh sửa Phase 1 mà không có thông báo lỗi nào.

**Cách sửa (phía backend):** Validate rõ ràng và trả HTTP 422 nếu có field nào trống thay vì im lặng fallback:
```python
if any(desc_fields.values()):  # có ít nhất 1 field → user có ý định gửi description
    missing = [k for k, v in desc_fields.items() if not v]
    if missing:
        raise HTTPException(422, detail=f"Thiếu các field: {missing}")
    description_dict = desc_fields
```

---

## Lỗi #5 — `re.MULTILINE` trên `_CODE_FENCE_RE` có thể xóa nội dung hợp lệ trong JSON

**File:** `backend/services/llm_service.py` — `_CODE_FENCE_RE` (~line 525)
**Mức độ:** 🟠 Trung bình

**Mô tả:**
```python
# Cũ (không có MULTILINE):
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

# Mới (có MULTILINE):
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
```

Không có `re.MULTILINE`: `^` và `$` chỉ match đầu/cuối của **toàn bộ chuỗi**.
Có `re.MULTILINE`: `^` và `$` match đầu/cuối của **mỗi dòng**.

Pattern `\s*```$` với MULTILINE sẽ khớp bất kỳ dòng nào **kết thúc bằng ` ``` `**, kể cả dòng nằm bên trong giá trị JSON. Ví dụ:

```json
{"key_message_rule": "Trình bày ví dụ code: ```"}
```

Dòng chứa `code: \`\`\`` sẽ bị regex xóa phần `` ``` `` đi → JSON bị hỏng hoặc giá trị bị cắt.

**Cách sửa:** Bỏ `re.MULTILINE` nếu không cần thiết, hoặc dùng regex cẩn thận hơn:
```python
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n|\n\s*```\s*$", re.IGNORECASE)
```

---

## Lỗi #6 — Nút "Phân tích thiết kế" check `.length` nhưng validation check `.trim()`

**File:** `frontend/src/pages/GeneratePage.tsx` (~line 358)
**Mức độ:** 🟡 Thấp

**Mô tả:**
```tsx
// Nút disabled dựa theo độ dài thô:
disabled={isFormLocked || formData.purpose.length < 3 || formData.audience.length < 3}

// Nhưng handleAnalyze validate bằng trim():
if (!formData.purpose.trim() || !formData.audience.trim()) {
    setDescError('Vui lòng điền đầy đủ Mục đích và Đối tượng.')
    return
}
```

**Hậu quả:** User nhập `"   "` (3 dấu cách) vào cả 2 field → nút được enable (length = 3) → click → `"   ".trim() = ""` → hiện thông báo lỗi. Nút trông có thể click nhưng không làm gì.

**Cách sửa:** Đồng nhất điều kiện disabled:
```tsx
disabled={isFormLocked || formData.purpose.trim().length < 3 || formData.audience.trim().length < 3}
```

---

## Tóm tắt

| # | File | Hàm / Vị trí | Mức độ | Tóm tắt |
|---|---|---|---|---|
| 1 | `services/llm_service.py:311` | `_split_batch()` | 🔴 Cao | `ValueError` không được retry → job FAILED ngay |
| 2 | `services/llm_service.py:530` | `_safe_parse()` | 🔴 Cao | Thiếu guard `None` → `TypeError` khi Gemini lọc content |
| 3 | `services/llm_service.py:339` | `_recursive_summarize()` | 🔴 Cao | `resp.text.strip()` crash nếu chunk bị lọc bởi SAFETY |
| 4 | `api/prompt_router.py:119` | `generate()` | 🟠 Trung bình | `all()` im lặng bỏ toàn bộ description khi 1 field trống |
| 5 | `services/llm_service.py:525` | `_CODE_FENCE_RE` | 🟠 Trung bình | `re.MULTILINE` xóa `` ``` `` hợp lệ bên trong JSON |
| 6 | `pages/GeneratePage.tsx:358` | button disabled | 🟡 Thấp | `.length` vs `.trim()` không đồng nhất |
