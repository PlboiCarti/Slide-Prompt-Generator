- 2 giai đoạn:
  + Nút giai đoạn 1 (form → sinh mô tả): "Tạo bản mô tả" hoặc "Phân tích & gợi ý thiết kế"
  + Nút giai đoạn 2 (mô tả đã sửa → tạo prompt): "Tạo Master Prompt" hoặc "Hoàn tất & Sinh Prompt"

  UI/ UX:

  Màn hình ban đầu:           Sau khi bấm nút:
┌─────────────────┐         ┌─────────────────┐
│ Purpose         │         │ Purpose    [✓]  │
│ Audience        │         │ Audience   [✓]  │
│ Style           │   →→→   │ Style      [✓]  │
│ Layout          │ bấm nút │ Layout     [✓]  │
│ Color           │         │ Color      [✓]  │
│ Slide count     │         │ Slide count[✓]  │
│                 │         ├─────────────────┤
│ [Phân tích &    │         │ ✦ Mô tả thiết kế│  ← mới hiện
│  Gợi ý thiết kế]│         │ Tone:   [____] │
└─────────────────┘         │ Font:   [____] │
                            │ Density:[____] │
                            │ Visual: [____] │
                            │                │
                            │ [Tạo Master    │
                            │  Prompt →]     │
                            └─────────────────┘

                            # Thiết kế Flow Mới — Prompt Builder v2

## Tổng quan thay đổi

Phiên bản hiện tại xử lý toàn bộ pipeline trong **1 lần submit duy nhất**, người dùng không có cơ hội xem và chỉnh sửa mô tả thiết kế trước khi sinh prompt. Phiên bản mới tách thành **2 giai đoạn rõ ràng**, cho phép người dùng kiểm soát output tốt hơn.

---

## So sánh Pipeline

### Cũ — 1 giai đoạn

```
User nhập 6 trường
        ↓
_build_instruction_from_payload()   ← gộp 6 trường thành 1 string thô
        ↓
generate_master_prompt_structure()  ← Gemini nhận string thô, tự suy ra mọi thứ
        ↓
split_content_to_slides()
        ↓
assemble_master_prompt()
```

**Vấn đề:**
- Gemini phải tự parse chuỗi string — không có schema rõ ràng
- Người dùng không biết AI đang hiểu yêu cầu của mình như thế nào
- Không có cơ hội can thiệp vào giữa pipeline

---

### Mới — 2 giai đoạn

```
Giai đoạn 1                         Giai đoạn 2
─────────────────────────────        ──────────────────────────────────
User nhập 6 trường                   User xem & chỉnh mô tả
        ↓                                    ↓
generate_design_description()        generate_slide_structure()
  → Gemini sinh mô tả chi tiết         → Sinh N slide (title + instruction)
  → Trả về dict JSON                          ↓
        ↓                            fill_slide_contents()
Frontend hiển thị                      → Ghép content/PDF vào từng slide
Tone / Font / Density / Visual                ↓
        ↓                            assemble_master_prompt()
User sửa nếu muốn                      → Xuất Master Prompt hoàn chỉnh
        ↓
Bấm "Tạo Master Prompt"
```

---

## Thiết kế Hàm Backend

### B1 — `generate_design_description()`

```
Input:  purpose, audience, style, layout, color, language
Output: dict JSON

{
  "tone":             "Chuyên nghiệp, dựa trên dữ liệu, tự tin",
  "font":             "Montserrat",
  "key_message_rule": "Tiêu đề ngắn gọn, in đậm, kèm số liệu",
  "density":          "Tối đa 2 bullet mỗi slide, ưu tiên biểu đồ",
  "visual":           "Nền trắng, điểm nhấn xanh dương, không gian âm"
}
```

> Gọi trực tiếp (synchronous) — không cần background job vì response nhanh (~3–5s)

---

### B2 — `generate_slide_structure()`

```
Input:  purpose, audience, style, layout, slide_count, language
Output: list[SlideInstruction]

[
  SlideInstruction(index=1, title="Giới thiệu & Tầm nhìn", instruction="...", content=""),
  SlideInstruction(index=2, title="Vấn đề thị trường",     instruction="...", content=""),
  ...
]
```

> Validate thành `list[SlideInstruction]` **ngay khi nhận từ Gemini** — không để `list[dict]` thô chạy xuyên pipeline

---

### B3 — `fill_slide_contents()`

```
Input:  list[SlideInstruction], content (text + PDF đã gộp), language
Output: list[SlideInstruction] — đã có content từng slide

Logic:
  - Có content từ tài liệu → bám sát tài liệu
  - Không có              → Gemini tự sinh dựa trên title + instruction + mô tả B1
```

---

### Cuối — `assemble_master_prompt()`

```
Input:  design_description (dict), list[SlideInstruction], slide_count, language
Output: MasterPromptResult

Ghép thành cấu trúc:
  [VAI TRÒ]
  [NHIỆM VỤ]
  [CHỈ DẪN]     ← từ purpose + audience + style
  [MÔ TẢ]       ← từ design_description (B1, đã được user chỉnh)
  [FORMAT]
  [NỘI DUNG TỪNG SLIDE]
```

---

## API Endpoints

| | Endpoint | Gọi lúc nào | Sync/Async |
|---|---|---|---|
| Giai đoạn 1 | `POST /api/generate-description` | Bấm nút 1 | **Sync** — trả về ngay |
| Giai đoạn 2 | `POST /api/generate` | Bấm nút 2 | **Async** — background job |

### `POST /api/generate-description`

```json
// Request body
{
  "purpose":        "pitch",
  "audience":       "investor",
  "style":          "modern",
  "primary_layout": "key_message",
  "primary_color":  "#FF6B35",
  "language":       "vi"
}

// Response — trả về ngay, không qua job
{
  "tone":             "...",
  "font":             "...",
  "key_message_rule": "...",
  "density":          "...",
  "visual":           "..."
}
```

### `POST /api/generate` *(cập nhật)*

```json
// Thêm field description so với version cũ
{
  "purpose":        "pitch",
  "audience":       "investor",
  "style":          "modern",
  "primary_layout": "key_message",
  "primary_color":  "#FF6B35",
  "slide_count":    8,
  "language":       "vi",
  "content":        "...",
  "description": {              // ← FIELD MỚI — mô tả đã được user chỉnh
    "tone":             "...",
    "font":             "...",
    "key_message_rule": "...",
    "density":          "...",
    "visual":           "..."
  }
}
```

---

## Thiết kế Frontend — Progressive Disclosure

### Nguyên tắc

> Chỉ hiển thị thông tin khi người dùng thực sự cần — tránh gây choáng ngợp khi mở trang.

Màn hình ban đầu chỉ có **6 trường nhập liệu**. Phần mô tả thiết kế hoàn toàn ẩn. Sau khi bấm nút, phần mô tả **trượt xuất hiện ngay bên dưới** — không reload trang, không mất dữ liệu.

---

### Trạng thái màn hình

#### Trạng thái 1 — Ban đầu

```
┌─────────────────────────────────────────────────────┐
│  ✦ Tạo Master Prompt                                │
│  Điền thông tin → nhận mô tả → chỉnh sửa → sinh prompt│
├─────────────────────────────────────────────────────┤
│                                                     │
│  Mục đích          Đối tượng                        │
│  [pitch       ▾]   [investor    ▾]                  │
│                                                     │
│  Phong cách        Bố cục chính                     │
│  [modern      ▾]   [key_message ▾]                  │
│                                                     │
│  Màu chủ đạo       Số slide                         │
│  [🟠 #FF6B35  ]    [━━●━━━━━━] 8                   │
│                                                     │
│  Nội dung tài liệu                                  │
│  [________________________________]                 │
│  [________________________________]                 │
│                                                     │
│  [ 📄 Upload PDF ]                                  │
│                                                     │
│          [ Phân tích & Gợi ý thiết kế → ]           │  ← Nút 1
└─────────────────────────────────────────────────────┘
```

---

#### Trạng thái 2 — Đang gọi API (sau khi bấm nút 1)

```
┌─────────────────────────────────────────────────────┐
│  Mục đích: pitch   Đối tượng: investor              │  ← Thu gọn
│  Phong cách: modern  Bố cục: key_message  ...       │
│                                              [Sửa ✎]│
├─────────────────────────────────────────────────────┤
│                                                     │
│    ◌  Đang phân tích và gợi ý thiết kế...           │  ← Spinner
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

#### Trạng thái 3 — Có mô tả, user chỉnh sửa

```
┌─────────────────────────────────────────────────────┐
│  Mục đích: pitch   Đối tượng: investor              │  ← Thu gọn
│  Phong cách: modern  Bố cục: key_message  ...       │
│                                              [Sửa ✎]│
├─────────────────────────────────────────────────────┤
│  ✦ Mô tả thiết kế                    [🔄 Sinh lại] │  ← Phần mới hiện
│  AI đã phân tích — bạn có thể chỉnh sửa trước khi sinh│
│                                                     │
│  Tone                                               │
│  [Chuyên nghiệp, dựa trên dữ liệu, tự tin         ]│
│                                                     │
│  Font                                               │
│  [Montserrat                                       ]│
│                                                     │
│  Key Message Rule                                   │
│  [Tiêu đề ngắn, in đậm, kèm số liệu               ]│
│                                                     │
│  Density                                            │
│  [Tối đa 2 bullet/slide, ưu tiên biểu đồ           ]│
│                                                     │
│  Visual                                             │
│  [Nền trắng, điểm nhấn xanh dương, không gian âm  ]│
│                                                     │
├─────────────────────────────────────────────────────┤
│  [← Quay lại]              [ Tạo Master Prompt → ]  │  ← Nút 2
└─────────────────────────────────────────────────────┘
```

---

### Cách thực hiện — React State

```javascript
// Chỉ cần 2 state để điều khiển toàn bộ flow
const [step, setStep]               = useState(1)       // 1 | 2
const [description, setDescription] = useState(null)    // dict từ API

// Bấm nút 1
const handleAnalyze = async () => {
  const result = await generateDescription(form)  // gọi API
  setDescription(result)
  setStep(2)                                      // hiện phần mô tả
}

// User sửa từng ô — không gọi API, chỉ cập nhật state
const handleDescriptionChange = (key, value) => {
  setDescription(d => ({ ...d, [key]: value }))
}

// Bấm nút 2
const handleGenerate = async () => {
  await generate({ ...form, description })        // gửi mô tả đã sửa
}
```

```jsx
{/* Luôn hiển thị — thu gọn khi step = 2 */}
<FormSection
  collapsed={step === 2}
  onEdit={() => setStep(1)}
/>

{/* Nút 1 — chỉ hiện ở step 1 */}
{step === 1 && (
  <button onClick={handleAnalyze}>
    Phân tích & Gợi ý thiết kế →
  </button>
)}

{/* Phần mô tả — chỉ hiện ở step 2 */}
{step === 2 && (
  <DescriptionSection
    description={description}
    onChange={handleDescriptionChange}
    onRegenerate={handleAnalyze}
    onBack={() => setStep(1)}
    onSubmit={handleGenerate}
  />
)}
```

---

### Animation trượt xuất hiện

```css
/* Phần mô tả trượt xuống mượt khi hiện */
.description-section {
  animation: fadeSlideDown 0.4s ease both;
}

@keyframes fadeSlideDown {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## Luồng dữ liệu đầy đủ

```
[Form: 6 trường]
        │
        │ bấm nút 1
        ▼
POST /api/generate-description
        │
        │ ~3-5 giây
        ▼
{ tone, font, density, key_message_rule, visual }
        │
        │ hiện lên UI, user đọc & sửa
        ▼
[Description: 5 ô input]
        │
        │ bấm nút 2
        ▼
POST /api/generate
  { ...6 trường, description: { ...5 field đã sửa } }
        │
        │ background job
        ▼
B2: generate_slide_structure()   → list[SlideInstruction]
B3: fill_slide_contents()        → list[SlideInstruction] + content
B4: assemble_master_prompt()     → MasterPromptResult
        │
        │ frontend poll mỗi 3s
        ▼
[Kết quả: Master Prompt hoàn chỉnh]
```

---

## Lý do thiết kế — Tại sao mỗi quyết định lại như vậy

| Quyết định | Lý do |
|---|---|
| B1 trả **JSON** (không phải string) | Mỗi field hiển thị thành 1 ô input riêng, user sửa được từng phần |
| B2 trả **JSON** (không phải string) | B3 cần đọc `title` và `instruction` theo từng slide để ghép content |
| B1 **synchronous** | Chỉ 1 lần gọi Gemini, nhanh — không cần background job |
| B2+B3 **background job** | Có thể mất 30–60s — không thể block HTTP request |
| Các ô Tone/Font **không gọi API** | Chỉ cập nhật React state — API chỉ được gọi 2 lần cố định |
| Form **thu gọn** (không ẩn hoàn toàn) | User cần thấy mình đã chọn gì để hiểu mô tả AI đang dựa trên thông tin nào |
| Có nút **Sinh lại** | Nếu AI sinh mô tả không ưng, bấm sinh lại mà không cần quay về nhập lại từ đầu |