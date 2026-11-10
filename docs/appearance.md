# Giao diện sáng / tối

Cập nhật theo yêu cầu ngày 10/11/2026. Giữ hệ thống thiết kế pastel ban đầu và thêm biến thể tối theo cùng vai trò màu.

## Cách dùng

- Nút mặt trăng / mặt trời trên thanh trên chuyển nhanh giữa sáng và tối, ở cả desktop và mobile.
- **Cài đặt → Giao diện** có **Sáng**, **Tối**, **Theo hệ thống**. Mặc định theo hệ thống; lựa chọn cụ thể có quyền ưu tiên hơn thiết bị.
- Chế độ hệ thống tự cập nhật khi thiết bị đổi sáng/tối, không cần tải lại trang.
- Lựa chọn nằm ở `writing-award:theme:v1`, tách khỏi bài viết/tiến trình và đồng bộ giữa các tab. Khi bộ nhớ bị chặn, vẫn đổi được giao diện trong phiên hiện tại.

## Triển khai

`public/theme-init.js` áp dụng lựa chọn trước khi React và CSS ứng dụng hiển thị. `src/theme.tsx` quản lý lựa chọn, theo dõi media query và storage event, cập nhật `data-theme`, `color-scheme` và meta theme-color.

`src/styles.css` giữ bảng màu sáng; biến thể tối dùng nền plum ấm, chữ kem, lavender sáng và các nền trạng thái xanh/mint/peach trầm. Có token riêng cho chữ trên CTA, nút xóa, toast, overlay và spinner. Form native, focus, selection, caret, hộp thoại và thanh điều hướng cùng đổi giao diện.

Three.js đổi ánh sáng và mặt đất ngay trong scene hiện có. Camera, góc xoay, zoom và bản nháp không bị đặt lại. `DESIGN.md` và `.impeccable/design.json` ghi lại các token và hành vi mới.

## Kiểm tra

- Build TypeScript/Vite: đạt.
- 12/12 kiểm thử quy tắc: đạt.
- Toàn bộ Playwright: 39 kiểm thử đạt, 1 kiểm thử touch trùng lặp trên desktop được bỏ qua; kiểm thử touch tương ứng trên mobile đạt.
- 16 kiểm thử mới cho appearance: đổi nhanh, giữ lựa chọn qua reload/route, đổi theo thiết bị, ưu tiên lựa chọn thủ công, bootstrap trước React, lỗi storage, đồng bộ tab, giữ canvas/bản nháp, các route và trạng thái lỗi/phần thưởng/xác nhận xóa trong tối.
- Axe không phát hiện vi phạm trong bộ WCAG A/AA được chạy trên bốn route ở cả hai theme, desktop/mobile, và các trạng thái tối nói trên.
- Các route không tràn ngang tại 320, 390, 768 và 1440px ở cả hai theme.
- Production preview HTTP 200. Khi chặn bundle React, HTML đã có `data-theme=dark`, root chưa render và nền là RGB 33,30,36: lựa chọn được áp dụng trước app.
- Đã xem ảnh desktop/mobile hai theme, khung viết, cài đặt, bộ sưu tập, nhật ký và phần thưởng tối. Ảnh trong `.impeccable/review/theme-*.png`; console error capture rỗng.

Kiểm thử dùng Chromium/SwiftShader và mobile giả lập, chưa phải thiết bị iPhone/Safari thật. Cảnh báo chunk engine Three.js của Vite giữ nguyên như trước.
