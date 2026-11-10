# Writing Award — UI/UX design v2

**Concept:** One essay. One little piece of happiness.  
**Direction chosen:** Hoàn thành Nhà Capybara trước, sau đó mới mở khóa thế giới tiếp theo.

## 1. Tầm nhìn

Một website luyện IELTS Writing hằng ngày với cảm giác như trò chơi xây dựng 3D thư giãn. Sự tiến bộ học tập được thể hiện bằng mảnh ghép nhìn thấy được, không phải những biểu đồ áp lực. Trải nghiệm được thiết kế để người dùng muốn quay lại hôm sau xem thế giới mình thay đổi ra sao.

## 2. Thế giới và trình tự mở khóa

| Thế giới | Cần để bắt đầu | Hoàn thành | Thẩm mỹ/đồ được xây |
| --- | --- | --- | --- |
| 01 · Capy's Dream Cottage 🏡 | Mở mặc định | 21 bài hợp lệ vào 21 ngày khác nhau | Ngôi nhà, cửa, mái, vườn, cây, chú Capy |
| 02 · Cây Thần Kỳ 🌸 | Hoàn thành 21/21 Nhà Capybara | Tổng 42 ngày có bài hợp lệ | Cây hoa anh đào, thư viện, đèn, bàn, hoa |
| 03 · Lego Capybara 🧩 | Hoàn thành thêm 21/21 Cây Thần Kỳ | Tổng 63 ngày có bài hợp lệ | Một chú Capy bằng các khối Lego, vương miện |

Mỗi thế giới có 21 mảnh độc lập. Công trình hoàn thành được giữ lại vĩnh viễn, xem trong **Bộ sưu tập**. Ở bản demo, nhấn “🔓 Xem thế giới tiếp” để thử ngay chuyển chương (chỉ dành cho dữ liệu mẫu).

## 3. Bản thiết kế hình ảnh

- **Dashboard:** Màn hình chính gồm khu mô hình 3D lớn bên trái, khung dán/upload IELTS Writing bên phải, và ba thẻ thông tin nhỏ (streak, freeze, tổng bài) bên dưới.
- **Bộ sưu tập:** Danh sách 3 thế giới; thế giới chưa đạt điều kiện hiển thị khóa và progress trống. Có thể chọn thế giới đã mở để xem các mảnh ghép và mô hình của nó.
- **Khoảnh khắc phần thưởng:** Khi nộp bài hợp lệ, modal chúc mừng hiển thị tên mảnh mới, confetti, hiệu ứng mảnh lắp từ trên xuống và nút quay về ngắm công trình.
- **Nhật ký:** Danh sách bài Writing, ngày, Task 1/2, số từ; có thể xem lại bài lưu.
- **Responsive:** 2 cột trên desktop; xếp mô hình 3D rồi khung nộp bài trên mobile.

### Visual direction

- **Palette:** ivory `#FFF9F2`, peach `#F3A18C`, lavender `#B0A0E8`, mint `#DCEEDB`, warm brown `#453A33`.
- **Typography:** rounded, cỡ chữ rõ, CTA lớn.
- **Object style:** pastel toy/diorama, tường kem, mái ngói hồng, bông hoa nhỏ; chuyển tiếp thế giới bằng reveal, soft glow, confetti.
- **3D:** kéo để xoay, cuộn/gesture để zoom; mảnh mới rơi vào vị trí. Bản HTML hiện dùng custom mesh + Canvas2D projection, là prototype kỹ thuật, **không** phải asset 3D Blender/WebGL chất lượng cao như trong mockup.

## 4. Rules & streak

- Mỗi ngày lịch theo múi giờ tài khoản, bài Writing Task 1 đủ 150 từ hoặc Task 2 đủ 250 từ mới nhận 1 mảnh và +1 streak.
- Cùng ngày nộp nhiều bài: ghi lại vào nhật ký nhưng không cộng mảnh thứ hai.
- Mỗi 7 ngày streak: thêm 1 Streak Freeze (tối đa 2).
- Bỏ lỡ 1 ngày: nếu có Freeze, tự dùng để giữ streak; không tự sinh mảnh.
- Bỏ lỡ quá 1 ngày hoặc hết Freeze: streak về 0; giảm một sao trang trí, chuyển cảnh sang trời mưa tạm thời. **Không xóa những công trình đã xây, mảnh hay bài viết.**
- 21/21: được xem animation “World complete”, chương mới được mở ngay; lượt nộp bài hợp lệ tiếp theo bắt đầu tạo mảnh số 1 cho chương tiếp theo.

## 5. Hướng thiết kế ưu tiên

**Phase 1 — Demo UX:** Pasted text, upload text, canvas 3D cơ bản, nhật ký và progression.  
**Phase 2 — Polished scene:** Artwork 3D GLB từ Blender, Three.js, particles, hiệu ứng lắp ghép 600–1000 ms, âm thanh bật/tắt, tải asset theo yêu cầu, fallback reduced motion.  
**Phase 3 — Production:** Auth, DB đồng bộ, backend xác thực ngày/múi giờ, hạn chế spam/phát hiện bài trùng, upload DOCX/PDF đáng tin cậy, tính streak server-side và kiểm soát phần thưởng idempotent.

**Giới hạn demo:** Dữ liệu lưu ở localStorage, không có tài khoản; chưa chấm IELTS Writing bằng AI; không chứng thực quyền sở hữu bài; trình đọc DOCX/PDF dùng thư viện CDN nên cần Internet. Tất cả hình minh họa mockup là đề xuất giao diện, không phải screenshot của engine 3D trong HTML.
