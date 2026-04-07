/* ═══════════════════════════════════════════════════════════════
   Marketing Templates — TikTok AI Prompt Generator
   AI sinh prompt ảnh + video liền mạch dựa trên phân tích SP
   ═══════════════════════════════════════════════════════════════ */

// ─── Product Categories ───
export const CATEGORIES = [
  { id: 'auto', label: '🤖 Auto Detect', icon: '🤖' },
  { id: 'fashion', label: '👗 Thời Trang', icon: '👗' },
  { id: 'electronics', label: '📱 Điện Tử', icon: '📱' },
  { id: 'home', label: '🏠 Đồ Gia Dụng', icon: '🏠' },
  { id: 'bedding', label: '🛏️ Chăn Gối Nệm', icon: '🛏️' },
  { id: 'accessories', label: '👜 Phụ Kiện', icon: '👜' },
  { id: 'other', label: '📦 Khác', icon: '📦' },
];

// ─── Video Styles ───
export const VIDEO_STYLES = [
  { id: 'product_showcase', label: '📸 Product Showcase', desc: 'Giới thiệu sản phẩm chuyên nghiệp, quay 360°' },
  { id: 'unboxing', label: '📦 Unboxing', desc: 'Trải nghiệm mở hộp ASMR' },
  { id: 'before_after', label: '✨ Before/After', desc: 'Trước và sau khi sử dụng' },
  { id: 'lifestyle', label: '🌿 Lifestyle', desc: 'Sản phẩm trong đời sống hàng ngày' },
  { id: 'tutorial', label: '📖 Tutorial', desc: 'Hướng dẫn sử dụng từng bước' },
  { id: 'trending', label: '🔥 Trending/Viral', desc: 'Phong cách viral, scroll-stopping' },
  { id: 'testimonial', label: '💬 Testimonial', desc: 'Review chân thực, đánh giá' },
  { id: 'bts', label: '🎬 Behind The Scenes', desc: 'Hậu trường sản xuất / tạo SP' },
];

// ─── Duration Options ───
export const DURATION_OPTIONS = [
  { seconds: 8,  clips: 1, frames: 2, label: '8s' },
  { seconds: 16, clips: 2, frames: 3, label: '16s' },
  { seconds: 24, clips: 3, frames: 4, label: '24s' },
  { seconds: 32, clips: 4, frames: 5, label: '32s' },
  { seconds: 40, clips: 5, frames: 6, label: '40s' },
  { seconds: 48, clips: 6, frames: 7, label: '48s' },
];

// ═══════════════════════════════════════════════════════════════
// MEGA PROMPT — AI phân tích SP + sinh N+1 frame + video prompts
// Gửi 1 lần duy nhất, AI trả về JSON đầy đủ
// ═══════════════════════════════════════════════════════════════
export function buildMegaPrompt({ category, notes, duration, videoStyle, hasPortrait, imageCount }) {
  const dur = DURATION_OPTIONS.find(d => d.seconds === duration) || DURATION_OPTIONS[0];
  const style = VIDEO_STYLES.find(s => s.id === videoStyle) || VIDEO_STYLES[0];
  const catLabel = category === 'auto' ? 'Tự nhận diện' : (CATEGORIES.find(c => c.id === category)?.label || category);

  return `Bạn là chuyên gia TikTok Marketing hàng đầu, đồng thời là cinematographer và art director chuyên nghiệp. 

=== NHIỆM VỤ ===
Phân tích ${imageCount > 1 ? `${imageCount} ảnh sản phẩm đính kèm` : 'ảnh sản phẩm đính kèm'} và tạo kịch bản marketing video TikTok hoàn chỉnh.

=== CẤU HÌNH VIDEO ===
- Thời lượng: ${dur.seconds}s (${dur.clips} clips × 8s mỗi clip)
- Phong cách: ${style.label} — ${style.desc}
- Số frame cần tạo: ${dur.frames} ảnh (thuật toán N+1: ${dur.clips} clips cần ${dur.frames} keyframes)
- Loại sản phẩm: ${catLabel}
- Tỷ lệ: 9:16 (dọc, TikTok)
${hasPortrait ? `- Có ảnh chân dung người dùng/KOL → tích hợp người này vào scenes phù hợp` : '- Không có chân dung → chỉ dùng tay/bàn tay hoặc không có người'}
${notes ? `- Ghi chú của người dùng: ${notes}` : ''}

=== QUY TẮC N+1 STORYBOARD ===
Video gồm ${dur.clips} clip, mỗi clip 8s. Clip i dùng Frame i làm FIRST FRAME và Frame i+1 làm LAST FRAME.
→ Frame cuối clip trước = Frame đầu clip sau → VIDEO LIỀN MẠCH.
Ví dụ: Clip 1 = Frame 1→Frame 2, Clip 2 = Frame 2→Frame 3, v.v.

=== YÊU CẦU TỪNG FRAME PROMPT ===
Mỗi frame prompt phải:
1. MÔ TẢ CỤ THỂ hình ảnh: bố cục, góc máy, ánh sáng, background, vật thể, chi tiết sản phẩm
2. MÔ TẢ SẢN PHẨM TRONG CẢNH dựa trên ảnh sản phẩm thật (tên SP, màu sắc, hình dáng, chất liệu từ ảnh)
3. LIÊN KẾT với frame trước/sau (mô tả sao cho ảnh liền kề có thể chuyển cảnh mượt)
4. Prompt phải DÀI, CHI TIẾT (ít nhất 150 từ/prompt), bằng tiếng Anh, dùng cho Nano Banana Pro
5. Bao gồm: camera angle, lighting setup, color palette, mood, composition details, product placement

=== YÊU CẦU TỪNG VIDEO CLIP PROMPT ===
Mỗi video clip prompt phải:
1. MÔ TẢ CHUYỂN ĐỘNG từ first frame → last frame: camera pan/zoom/dolly, hành động xảy ra
2. MÔ TẢ SẢN PHẨM rõ ràng (tên, đặc điểm từ ảnh upload)
3. TẠO KỊCH BẢN HÀNH ĐỘNG cụ thể trong 8s: giây 0-2 làm gì, giây 3-5 làm gì, giây 6-8 làm gì
4. Bao gồm: camera movement, lighting changes, actions, transitions, audio cues
5. Prompt phải DÀI, CHI TIẾT (ít nhất 200 từ/prompt), bằng tiếng Anh, dùng cho Veo 3.1
6. Mô tả first frame và last frame để Veo 3.1 interpolate chính xác

=== FORMAT OUTPUT (JSON) ===
Trả về ĐÚNG JSON, không thêm text nào khác:

{
  "analysis": {
    "productName": "Tên sản phẩm nhận diện được từ ảnh",
    "category": "ID danh mục (fashion/cosmetics/food/electronics/home/health/accessories/other)",
    "keyFeatures": ["Đặc điểm nổi bật 1 từ ảnh", "Đặc điểm 2", "Đặc điểm 3", "Đặc điểm 4"],
    "visualDescription": "Mô tả chi tiết hình ảnh sản phẩm: màu sắc, hình dáng, chất liệu, kích thước, logo, text trên SP...",
    "targetAudience": "Đối tượng mục tiêu (tuổi, giới tính, sở thích cụ thể)",
    "usp": "Điểm bán hàng độc nhất",
    "suggestedTone": "Tone marketing phù hợp",
    "emotionalHook": "Cảm xúc khai thác",
    "colorPalette": ["#hex1", "#hex2", "#hex3"],
    "marketingAngles": ["Góc tiếp cận 1", "Góc 2", "Góc 3"]
  },
  "storyboardSummary": "Tóm tắt kịch bản video bằng tiếng Việt (2-3 câu ngắn mô tả story arc và ý tưởng chính)",
  "frames": [
    {
      "index": 0,
      "label": "Tên ngắn gọn cho frame (VD: 'Hook - Sản phẩm bí ẩn')",
      "description": "Mô tả ngắn bằng tiếng Việt scene này là gì, vai trò trong story",
      "prompt": "FULL English prompt for Nano Banana Pro image generation (150+ words). Very detailed: exact composition, camera angle (e.g. 45-degree overhead, eye-level close-up), lighting (e.g. soft key light from left, warm backlight), background (e.g. matte charcoal surface with subtle texture), product placement and description matching the uploaded images, color palette, mood, textures, depth of field, any props or elements. For vertical 9:16 TikTok format."
    }
  ],
  "clips": [
    {
      "index": 0,
      "label": "Tên clip (VD: 'Clip 1: Hook → Reveal')",
      "firstFrame": 0,
      "lastFrame": 1,
      "description": "Mô tả ngắn bằng tiếng Việt hành động trong clip này",
      "prompt": "FULL English prompt for Veo 3.1 video generation (200+ words). Describes: starting state matching Frame 0, ending state matching Frame 1, camera movement (pan/zoom/dolly/orbit direction and speed), product interaction and motion, lighting transitions, pacing per second (0-2s: ..., 3-5s: ..., 6-8s: ...), sound design hints, emotional arc of this segment. The description must clearly connect the first frame to the last frame so Veo 3.1 creates seamless interpolation. Vertical 9:16 TikTok format."
    }
  ]
}

CHỈ TRẢ VỀ JSON HỢP LỆ. Tất cả frame prompts và clip prompts phải bằng tiếng Anh, chi tiết, dài. analysis và description bằng tiếng Việt.`;
}
