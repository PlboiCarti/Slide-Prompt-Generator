"""
services/intent_dictionary.py

Từ điển toàn bộ intent options.
Muốn thêm option mới → chỉ cần thêm 1 dòng vào đây, không cần sửa logic.

Cấu trúc mỗi entry:
    "keyword": "instruction gửi cho LLM"
"""

INTENT_DICT: dict[str, dict[str, str]] = {

    # ── Mục đích thuyết trình ─────────────────────────────────────────────
    "purpose": {
        "pitch": (
            "Mục đích thuyết phục và kêu gọi đầu tư/hợp tác. "
            "Tạo urgency, nhấn mạnh cơ hội đang có. "
            "Kết thúc bằng next steps cụ thể và call-to-action mạnh."
        ),
        "report": (
            "Mục đích báo cáo kết quả/tình hình. "
            "Trình bày khách quan, số liệu chính xác. "
            "Có phần so sánh với mục tiêu ban đầu. "
            "Kết luận rõ ràng và đề xuất bước tiếp theo."
        ),
        "training": (
            "Mục đích đào tạo/hướng dẫn. "
            "Hướng dẫn từng bước, có ví dụ minh họa cụ thể. "
            "Dễ thực hành theo. "
            "Có checkpoint để người học tự kiểm tra hiểu bài."
        ),
        "proposal": (
            "Mục đích đề xuất giải pháp/dự án. "
            "Phân tích vấn đề hiện tại → đề xuất giải pháp → lộ trình thực hiện. "
            "Có timeline, budget estimate và resource cần thiết."
        ),
        "awareness": (
            "Mục đích nâng cao nhận thức. "
            "Làm rõ tầm quan trọng của vấn đề. "
            "Dùng số liệu và case study để tạo impact. "
            "Khơi dậy sự quan tâm và mong muốn tìm hiểu thêm."
        ),
        "demo": (
            "Mục đích demo sản phẩm/tính năng. "
            "Cấu trúc: Vấn đề → Solution overview → Demo từng bước → Kết quả. "
            "Tập trung vào trải nghiệm người dùng và giá trị thực tế."
        ),
    },

    # ── Đối tượng khán giả ────────────────────────────────────────────────
    "audience": {
        "investor": (
            "Đối tượng là nhà đầu tư. "
            "Nhấn mạnh ROI, tiềm năng thị trường, tốc độ tăng trưởng. "
            "Trình bày rõ rủi ro và cách giảm thiểu. "
            "Kết thúc bằng call-to-action rõ ràng."
        ),
        "student": (
            "Đối tượng là học sinh/sinh viên. "
            "Dùng ngôn ngữ đơn giản, dễ hiểu. "
            "Nhiều ví dụ thực tế gần gũi với cuộc sống. "
            "Giải thích thuật ngữ mới khi xuất hiện lần đầu."
        ),
        "teacher": (
            "Đối tượng là giáo viên/giảng viên. "
            "Cấu trúc bài giảng rõ ràng có mở bài, thân bài, kết bài. "
            "Có phần tóm tắt cuối mỗi phần lớn. "
            "Thêm câu hỏi gợi mở để tương tác với học sinh."
        ),
        "client": (
            "Đối tượng là khách hàng. "
            "Tập trung vào lợi ích trực tiếp cho họ, không nói về tính năng. "
            "Dùng ngôn ngữ của khách hàng, tránh jargon nội bộ. "
            "Giải quyết pain point cụ thể của họ."
        ),
        "executive": (
            "Đối tượng là lãnh đạo cấp cao. "
            "Cực kỳ ngắn gọn, đi thẳng vào kết quả và quyết định cần đưa ra. "
            "Không dài dòng, không chi tiết kỹ thuật thừa. "
            "Mỗi slide chỉ có 1 thông điệp chính."
        ),
        "general": (
            "Đối tượng đại chúng, không chuyên. "
            "Ngôn ngữ phổ thông, dễ hiểu với mọi người. "
            "Giải thích bối cảnh trước khi đi vào nội dung chính."
        ),
        "developer": (
            "Đối tượng là lập trình viên/kỹ sư. "
            "Có thể dùng thuật ngữ kỹ thuật không cần giải thích. "
            "Tập trung vào implementation, architecture và trade-offs. "
            "Ví dụ bằng code hoặc diagram được khuyến khích."
        ),
    },

    # ── Phong cách trình bày ──────────────────────────────────────────────
    "style": {
        "minimalist": (
            "Áp dụng thiết kế tối giản. "
            "Tối đa 3 luận điểm mỗi slide. "
            "Câu ngắn, ngôn ngữ súc tích, không rườm rà."
        ),
        "modern": (
            "Phong cách hiện đại, năng động. "
            "Ưu tiên số liệu thống kê, biểu đồ và dữ kiện cụ thể. "
            "Câu ngắn gọn, có impact."
        ),
        "storytelling": (
            "Xây dựng nội dung theo cấu trúc kể chuyện 3 hồi: "
            "Thiết lập → Xung đột → Giải quyết. "
            "Mỗi slide là một cảnh trong câu chuyện, kết nối liên tục. "
            "Kết thúc bằng thông điệp cảm xúc mạnh."
        ),
        "academic": (
            "Tuân thủ cấu trúc học thuật nghiêm ngặt. "
            "Luận điểm theo mô hình Claim → Evidence → Reasoning. "
            "Dùng thuật ngữ chuyên ngành chính xác. "
            "Có trích dẫn nguồn khi cần thiết."
        ),
        "corporate": (
            "Phong cách doanh nghiệp chuyên nghiệp. "
            "Tập trung vào KPI, số liệu đo lường được và kết quả cụ thể. "
            "Cấu trúc: Vấn đề → Giải pháp → Kết quả."
        ),
        "creative": (
            "Phong cách sáng tạo, độc đáo. "
            "Dùng ẩn dụ, câu chuyện và ví dụ bất ngờ. "
            "Khuyến khích tư duy khác biệt, không ngại thách thức quan điểm thông thường."
        ),
        "technical": (
            "Tập trung vào chi tiết kỹ thuật, kiến trúc và quy trình. "
            "Mỗi slide trình bày một concept kỹ thuật cụ thể. "
            "Có thể dùng pseudocode, sơ đồ luồng hoặc ví dụ minh họa."
        ),
    },

    # ── Bố cục slide ──────────────────────────────────────────────
    "layout": {
        "key_message": (
            "Một thông điệp cốt lõi duy nhất. "
            "Cỡ chữ rất lớn, thiết kế tối giản, loại bỏ mọi chi tiết thừa. "
            "Dùng để nhấn mạnh một tuyên bố, kết luận hoặc ý tưởng quan trọng nhất."
        ),
        "split": (
            "Bố cục chia đôi màn hình (thường là 50/50 hoặc 40/60). "
            "Một bên chứa hình ảnh/đồ thị, bên còn lại chứa nội dung văn bản. "
            "Rất tốt để minh họa trực quan trực tiếp cho text hoặc so sánh đối lập."
        ),
        "gridcards": (
            "Bố cục dạng lưới chứa các thẻ (cards) riêng biệt (ví dụ: 2x2 hoặc 3x1). "
            "Mỗi thẻ thường có cấu trúc: Icon/Hình nhỏ + Tiêu đề + Mô tả ngắn. "
            "Thích hợp để liệt kê các tính năng, lợi ích, hoặc các ý có tầm quan trọng tương đương."
        ),
        "timeline": (
            "Bố cục dòng thời gian hoặc các bước tuần tự. "
            "Trình bày các mốc sự kiện, lộ trình triển khai (roadmap) hoặc quy trình. "
            "Sử dụng các đường nối, mũi tên để dẫn dắt hướng nhìn của người đọc."
        ),
        "bigstat_impact": (
            "Tập trung hoàn toàn vào một con số thống kê hoặc chỉ số quan trọng (KPI). "
            "Con số được hiển thị cực lớn, nổi bật, kèm theo dòng chú thích ngắn gọn bên dưới. "
            "Nhằm tạo ấn tượng mạnh mẽ bằng dữ liệu thực tế."
        ),
        "full_image_text_overlay": (
            "Sử dụng một hình ảnh chất lượng cao tràn toàn bộ viền slide (full background). "
            "Văn bản được đặt đè lên trên ảnh (thường dùng lớp phủ - overlay màu tối để làm nổi chữ). "
            "Mang tính nghệ thuật cao, thích hợp cho slide mở đầu, chuyển phần hoặc tạo cảm xúc."
        ),
    },

    
    # ── Độ phức tạp nội dung ──────────────────────────────────────────────
    "complexity": {
        "basic": (
            "Trình độ cơ bản, mới bắt đầu tìm hiểu. "
            "Giải thích từ nền tảng, không bỏ qua bước nào. "
            "Không dùng thuật ngữ phức tạp, nếu có thì giải thích ngay."
        ),
        "intermediate": (
            "Trình độ trung cấp, đã có kiến thức nền. "
            "Có thể bỏ qua các khái niệm cơ bản. "
            "Tập trung vào ứng dụng thực tế và các trường hợp ngoại lệ."
        ),
        "advanced": (
            "Trình độ nâng cao, chuyên gia trong lĩnh vực. "
            "Đi sâu vào chi tiết kỹ thuật và nuance. "
            "Có thể thảo luận các trade-offs và edge cases."
        ),
    },

    # ── Độ dài nội dung mỗi slide ─────────────────────────────────────────
    "density": {
        "concise": (
            "Nội dung cực kỳ súc tích. "
            "Mỗi bullet tối đa 10 từ. "
            "Ưu tiên keyword hơn câu đầy đủ."
        ),
        "balanced": (
            "Nội dung cân bằng giữa ngắn gọn và đầy đủ. "
            "Mỗi bullet 1 câu hoàn chỉnh, khoảng 15-20 từ."
        ),
        "detailed": (
            "Nội dung chi tiết, đầy đủ thông tin. "
            "Mỗi bullet có thể 2-3 câu để giải thích rõ. "
            "Phần speaker notes dài và chi tiết."
        ),
    },

    # ── Tone giọng văn ────────────────────────────────────────────────────
    "tone": {
        "formal": (
            "Giọng văn trang trọng, lịch sự. "
            "Dùng kính ngữ và cấu trúc câu chuẩn mực."
        ),
        "casual": (
            "Giọng văn thân thiện, gần gũi. "
            "Có thể dùng câu hỏi tu từ và ngôn ngữ đời thường."
        ),
        "inspiring": (
            "Giọng văn truyền cảm hứng, energetic. "
            "Dùng động từ mạnh, câu khẳng định tích cực. "
            "Tạo cảm giác hứng khởi và có thể làm được."
        ),
        "neutral": (
            "Giọng văn trung lập, khách quan. "
            "Trình bày thông tin không thiên vị. "
            "Phù hợp báo cáo và phân tích."
        ),
    },
}

# ── Helper functions ──────────────────────────────────────────────────────────

def get_all_options() -> dict[str, list[str]]:
    """Trả về tất cả options theo category — dùng để gửi cho AI detect."""
    return {
        category: list(options.keys())
        for category, options in INTENT_DICT.items()
    }


def get_instruction(category: str, keyword: str) -> str | None:
    """Tra cứu instruction theo category + keyword."""
    return INTENT_DICT.get(category, {}).get(keyword)


def get_category_description() -> str:
    """Mô tả từng category — giúp AI hiểu context khi detect."""
    return """
    - purpose: mục đích của buổi thuyết trình
    - audience: đối tượng người xem thuyết trình
    - style: phong cách thiết kế và trình bày slide
    - layout: bố cục slide
    - complexity: độ phức tạp/trình độ của nội dung
    - density: mức độ chi tiết của nội dung mỗi slide
    - tone: giọng văn và cảm xúc trong ngôn ngữ
""".strip()