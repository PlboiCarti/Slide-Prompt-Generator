# import google.generativeai as genai

# # genai.configure(api_key="YOUR_GEMINI_API_KEY")

# def generate_slide_guidelines_with_gemini(purpose, audience, style, color, layout, language="vi"):
    
#     if language.lower() == "vi":
#         system_prompt = f"""Nhiệm vụ của bạn là nhận các thông tin đầu vào về thiết kế slide dưới đây:
# - Mục đích: {purpose}
# - Đối tượng: {audience}
# - Phong cách: {style}
# - Màu sắc: {color}
# - Bố cục: {layout}

# Từ dữ liệu này, sinh ra MỘT chuỗi văn bản duy nhất. Tuân thủ TUYỆT ĐỐI các quy tắc sau:

# [Chỉ ghi 1 câu trực diện mô tả mục tiêu thiết kế cốt lõi. BẮT ĐẦU ngay bằng các động từ như "Tập trung vào...", "Ưu tiên...", "Hướng đến...". Tuyệt đối KHÔNG viết câu mào đầu như "Thiết kế slide này nhằm..."]
# - Tone: [Phân tích giọng văn và cảm xúc]
# - Font: [Đề xuất ĐÚNG 1 tên font chữ duy nhất. Tuyệt đối KHÔNG dùng chữ "hoặc", không đưa ra lựa chọn thứ 2, không giải thích thêm.]
# - Key Message Rule: [Định hướng cách trình bày ý chính]
# - Density: [Quy định mật độ chữ, gạch đầu dòng]
# - Visual: [Hướng dẫn phân cấp thị giác, cách phối hợp màu sắc và bố cục]

# Chỉ xuất ra văn bản kết quả theo đúng cấu trúc trên, không giải thích thêm."""

#     elif language.lower() == "en":
#         system_prompt = f"""Your task is to take the following slide design inputs:
# - Purpose: {purpose}
# - Audience: {audience}
# - Style: {style}
# - Color: {color}
# - Layout: {layout}

# Based on these inputs, generate EXACTLY ONE text string. Strictly follow these rules:

# [A single, direct action phrase describing the core design objective. START directly with verbs like "Focuses on...", "Prioritizes...", "Aims to...". DO NOT write introductory phrases like "This presentation is for..."]
# - Tone: [Analyze tone and emotion]
# - Font: [Suggest EXACTLY ONE font name. DO NOT use the word "or", do NOT provide alternatives, do NOT explain.]
# - Key Message Rule: [Guidelines for presenting the main idea]
# - Density: [Rules for text density]
# - Visual: [Guidelines for visual hierarchy, coordinating color and layout]

# Output ONLY the formatted text matching the structure above, with no additional explanations."""
#     else:
#         raise ValueError("Ngôn ngữ (language) phải là 'vi' hoặc 'en'")

#     model = genai.GenerativeModel(
#         model_name="gemini-1.5-flash",
#         system_instruction=system_prompt
#     )

#     user_prompt = "Hãy tổng hợp và trả về kết quả theo đúng định dạng được yêu cầu."
    
#     response = model.generate_content(
#         user_prompt,
#         generation_config=genai.types.GenerationConfig(
#             temperature=0.1, # Hạ nhiệt độ xuống 0.1 để AI có tính quyết đoán cao nhất khi chọn 1 font
#         )
#     )
    
#     return response.text