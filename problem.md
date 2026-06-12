# Ghi chu ve cach quan ly `final_content` trong nhanh OCR

## Tom tat so sanh voi `main`

O nhanh `main`, viec doc PDF va gop noi dung duoc thuc hien ngay trong endpoint `/generate`:

```python
final_content = await extract_content(
    text_content=content or None,
    pdf_file=pdf_file,
)
```

Sau do payload truyen sang worker da co san `content = final_content`. Cach nay don gian, de doc, nhung endpoint HTTP phai cho qua trinh doc file/extract PDF hoan tat truoc khi tra `job_id`.

O nhanh `feature/scan_ocr`, endpoint `/generate` chi nhan request, luu file tam va truyen `file_paths` sang worker. Worker moi goi:

```python
final_content = extract_content_from_files(content, file_paths)
```

Cach bo tri nay phu hop hon voi OCR, vi OCR va convert PDF scan la tac vu nang, phu thuoc Tesseract/Poppler va co the mat thoi gian. Dua buoc nay vao background worker giup endpoint tra `job_id` nhanh hon va dung tinh than async job. Tuy nhien cach hien tai con mot so diem can chinh de quan ly chat hon.

## Bang van de va huong xu ly

| Van de | Vi tri code tuong ung | Huong xu ly de xuat |
|---|---|---|
| `final_content` khong con duoc tao trong router, co the gay nham lan khi doc code vi endpoint chi truyen `content` goc va `file_paths`. | `backend/api/prompt_router.py`: payload gan `"content": content`, sau do `payload["file_paths"] = file_paths`. `backend/workers/pipeline_worker.py`: worker moi goi `extract_content_from_files(content, file_paths)`. | Ghi chu ro trong router rang extract/gop content duoc thuc hien trong worker. Co the doi ten payload field thanh `raw_content` de phan biet voi `final_content`. |
| `input_payload` duoc luu vao DB truoc khi them `file_paths`, nen record trong DB khong phan anh day du input thuc te cua job. | `backend/api/prompt_router.py`: tao `payload`, tao `Job(input_payload=...)`, commit DB, sau do moi gan `payload["file_paths"] = file_paths`. | Luu file truoc, gan `file_paths` vao payload, roi moi tao `Job`. Hoac luu metadata file rieng thay vi dua duong dan tam vao `input_payload`. |
| Router luu file bang `f.filename` truc tiep, filename la du lieu tu client nen co rui ro ten file la/path traversal/ghi de file. | `backend/api/prompt_router.py`: `file_path = upload_dir / f.filename`. | Dung `Path(f.filename).name` de lay basename, sanitize ky tu la, hoac tao ten file rieng bang UUID va giu lai original filename trong metadata. |
| Validation file yeu hon nhanh `main`: nhanh hien tai chu yeu dua vao duoi file trong extractor, chua kiem tra MIME/magic bytes truoc khi luu/xu ly. | `backend/services/content_extractor.py`: `ext = os.path.splitext(file_path)[1].lower()`. `backend/api/prompt_router.py`: nhan `files` va luu thang vao disk. | Validate som trong router: gioi han MIME cho PDF/PNG/JPG/WEBP, kiem tra magic bytes neu can. Trong extractor van giu validate theo extension nhu lop phong ve thu hai. |
| File qua lon trong extractor hien dang bi bo qua bang warning, neu user chi upload file qua lon thi job co the fail muon voi loi "khong co noi dung". | `backend/services/content_extractor.py`: neu `file_size > MAX_FILE_SIZE` thi `continue`. | Nen raise loi ro rang khi file vuot gioi han, de job `FAILED` co message cu the. Neu cho phep bo qua tung file, can bao cao danh sach file bi bo qua. |
| Loi OCR/PDF chi xuat hien o job `FAILED`, khong phai response truc tiep cua `/generate`. Dieu nay dung voi async job, nhung UI can hien thi message ro. | `backend/workers/pipeline_worker.py`: catch exception va `_update_job(..., "FAILED", error_message=str(exc))`. `frontend/src/pages/GeneratePage.tsx`: hien `jobStatus?.error_message`. | Giu cach async, nhung chuan hoa message loi tu extractor de de hieu: thieu Tesseract, thieu Poppler, file khong ho tro, PDF khong doc duoc. |
| File tam co the con lai neu process bi kill truoc khi worker chay den `finally`. | `backend/workers/pipeline_worker.py`: xoa `uploads/{job_id}` trong `finally`. | Them job cleanup khi app start hoac scheduled cleanup cho thu muc `uploads` cu. Co the dat TTL cho folder tam. |
| OCR dang co dinh ngon ngu `vie`, co the doc kem voi file tieng Anh hoac song ngu. | `backend/services/content_extractor.py`: `pytesseract.image_to_string(..., lang='vie')`. | Dung `lang='vie+eng'` hoac truyen theo field `language` tu payload. Neu chon theo payload, can truyen `language` vao extractor. |
| Extractor tra `ValueError`, router/worker boc thanh job error, trong khi nhanh `main` dung `HTTPException` voi status code ro hon. | `backend/services/content_extractor.py`: raise `ValueError`. `backend/workers/pipeline_worker.py`: catch va raise lai `ValueError(f"Loi doc noi dung file: {e}")`. | Vi extractor nay chay trong worker, `ValueError` la chap nhan duoc. Nen tao custom exception hoac helper tao message loi nguoi dung de thong nhat va de test. |

## Ket luan

Ve huong kien truc, dat buoc tao `final_content` trong worker la tot hon cho nhanh OCR vi giam viec nang trong request HTTP va gom toan bo pipeline xu ly noi dung vao background job. Diem can cai thien chu yeu nam o validation, metadata payload, ten file upload va cleanup file tam.
