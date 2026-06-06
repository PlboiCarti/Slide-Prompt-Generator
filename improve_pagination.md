# Improve History Pagination

## Hien trang

Backend `GET /api/history` dang dung offset pagination:

```python
limit: int = Query(10, ge=1, le=100)
offset: int = Query(0, ge=0)
```

Va query:

```python
jobs = query.order_by(Job.updated_at.desc()).offset(offset).limit(limit).all()
```

Dieu nay co nghia:

- Mac dinh moi request lay 10 item.
- Client co the truyen `limit` toi da 100, vi backend dang cho phep `le=100`.
- Neu user co hon 100 item history, backend van co the lay tiep bang cach tang `offset`.
- `total = query.count()` van tra ve tong so item that trong database, khong bi gioi han 100.
- Code hien tai chi gioi han so item tra ve trong mot request, khong phai gioi han tong history.

Vi du voi 150 item:

```text
GET /api/history?limit=10&offset=0    -> item 1-10
GET /api/history?limit=10&offset=90   -> item 91-100
GET /api/history?limit=10&offset=100  -> item 101-110
GET /api/history?limit=100&offset=0   -> item 1-100 trong 1 request
```

## Ket luan quan trong

Moi lan chuyen trang tren frontend nen la mot request moi:

```text
Page 1 -> GET /api/history?limit=10&offset=0
Page 2 -> GET /api/history?limit=10&offset=10
Page 3 -> GET /api/history?limit=10&offset=20
```

Neu chi khoa UI o frontend, user van co the goi truc tiep API va lay nhieu hon 10 item/request:

```text
GET /api/history?limit=100&offset=0
```

Vi vay neu business rule la "1 page chi hien 10 item", backend cung phai enforce.

## Yeu cau mong muon

- Moi page hien dung toi da 10 item.
- Toi da 10 page.
- Tong vung history co the xem qua pagination la 100 item moi nhat.
- Client khong duoc tu y lay 100 item trong 1 request.

## Huong sua de enforce 10 item/page

Cach toi thieu:

```python
limit: int = Query(10, ge=1, le=10)
```

Khi do request nay se bi FastAPI reject:

```text
GET /api/history?limit=100&offset=0
```

Nhung cach nay van cho client dung `offset=100`, `offset=110`, ... de doc tiep item cu hon neu khong chan offset.

## Huong sua tot hon: dung page co dinh

Neu rule la 10 item/page va toi da 10 page, nen khong cho client truyen `limit`.

Goi y:

```python
HISTORY_PAGE_SIZE = 10
HISTORY_MAX_PAGES = 10
HISTORY_MAX_ITEMS = HISTORY_PAGE_SIZE * HISTORY_MAX_PAGES

@router.get("/history", response_model=PaginatedHistoryResponse)
def get_history(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1, le=HISTORY_MAX_PAGES),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.deleted_at.is_(None),
        Job.status.in_(HISTORY_VISIBLE_STATUSES),
    )

    if status_filter:
        normalized_status = status_filter.upper()
        if normalized_status not in HISTORY_VISIBLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trang thai loc khong hop le.",
            )
        query = query.filter(Job.status == normalized_status)

    raw_total = query.count()
    total = min(raw_total, HISTORY_MAX_ITEMS)
    offset = (page - 1) * HISTORY_PAGE_SIZE

    jobs = (
        query.order_by(Job.updated_at.desc())
        .offset(offset)
        .limit(HISTORY_PAGE_SIZE)
        .all()
    )

    return {
        "items": [to_history_item(job) for job in jobs],
        "total": total,
        "limit": HISTORY_PAGE_SIZE,
        "offset": offset,
    }
```

Voi cach nay:

```text
GET /api/history?page=1   -> item 1-10
GET /api/history?page=10  -> item 91-100
GET /api/history?page=11  -> bi reject vi page > 10
```

## Luu y ve queue/xoa item cu

Tat ca cac cach tren chi gioi han viec doc/hien thi history. Chung khong xoa item trong database.

Neu muon history hoat dong nhu queue toi da 100 item, can them logic rieng:

- Sau khi tao prompt moi hoac luu draft moi.
- Dem so history active cua user.
- Neu vuot 100, lay cac item cu nhat.
- Xoa mem vao thung rac bang `deleted_at`, hoac xoa vinh vien tuy rule san pham.

Code hien tai chua co logic queue nay.
