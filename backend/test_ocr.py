import os
import sys
import logging

# Cấu hình log để hiển thị lỗi chi tiết từ request nếu có
logging.basicConfig(level=logging.INFO)

from services.content_extractor import _tesseract_extract

def test():
    file_path = "test.png"
    if not os.path.exists(file_path):
        print(f"❌ LỖI: Không tìm thấy file '{file_path}'!")
        return
        
    print(f"⏳ Đang phân tích file '{file_path}' bằng Tesseract OCR. Vui lòng đợi...")
    result = _tesseract_extract(file_path, is_pdf=file_path.endswith('.pdf'))
    
    print("\n" + "="*40)
    print("✅ KẾT QUẢ AI ĐỌC ĐƯỢC:")
    print(result if result.strip() else "(Không đọc được chữ nào hoặc có lỗi xảy ra)")
    print("="*40 + "\n")

if __name__ == "__main__":
    test()
