# Kiểm chứng triển khai và polish

Ngày kiểm tra: 09/11/2026. Phạm vi: demo UX theo `Writing_Award_UX_Design_v2.md`, React + TypeScript + Vite. Tài liệu sản phẩm có quyền ưu tiên.

## Từ critique/audit đến sửa lỗi

| Phát hiện | Thay đổi |
| --- | --- |
| Mobile phải cuộn xa mới thấy khung viết | Thêm “Viết hôm nay” ở màn hình đầu; chuyển tới khung viết và đặt focus vào ô soạn bài, vẫn giữ mô hình trước form. |
| Chữ phụ quá nhỏ, thiếu tương phản trên pastel | Chuẩn hóa cỡ chữ phụ, ô viết 16px; dùng màu chữ lavender/brown đậm hơn, giữ các màu nền trong docs. |
| Tab trong hộp thoại có điểm dừng ở body | Bổ sung vòng Tab/Shift+Tab và khôi phục focus; giữ Escape và nút đóng. |
| Điều hướng tablet bị ẩn nhãn nhìn thấy | Thêm accessible name cho các liên kết, không phụ thuộc nhãn hiện/ẩn. |
| Dữ liệu mẫu chưa có đường chuyển rõ | Hiện số bài mẫu và lối sang Cài đặt; mô tả việc xóa cả bài tự viết/bản nháp trước khi bắt đầu mới. |
| Mô hình nhạt và phần thưởng chung chung | Điều chỉnh ánh sáng/exposure; xem chính mảnh 3D vừa nhận trong modal. |
| Sau 63 mảnh có thể báo thưởng không tồn tại | Tiếp tục lưu bài và tăng chuỗi, không tạo mảnh ngoài ba thế giới. |
| Trạng thái sau nghỉ cần giữ công trình | Giữ bài/mảnh; giảm một sao trang trí, chuỗi về 0 và mưa tạm thời khi hết điều kiện bảo vệ. |
| Cử chỉ trên mô hình có thể chặn cuộn | Khôi phục touch-action cho cuộn dọc/pinch của trình duyệt; có nút xoay/zoom/đặt lại. |
| Review cuối: phần thưởng bị cắt chân và nhãn tiếng Việt lỗi | Cập nhật world matrix trước khi đo bounds/căn mảnh; sửa accessible name. Reviewer chấm cả hai đã giải quyết, không thấy regression trong lượt verdict. |

Đánh giá thiết kế ban đầu độc lập: [critique-initial.md](critique-initial.md), 29/40 theo Nielsen. Audit kỹ thuật ban đầu: [audit-initial.md](audit-initial.md). Review kết thúc độc lập: [finish-review.md](finish-review.md).

## Kết quả chạy

- `npm run build`: đạt kiểm tra TypeScript và tạo bundle production.
- `npm test`: 12/12 kiểm thử quy tắc đạt, gồm ngưỡng từ, ngày UTC+7, chỉ một phần thưởng/ngày, freeze, reset chuỗi, giữ công trình, mở thế giới và hoàn thành 63 mảnh.
- Playwright: 23 kiểm thử đạt; 1 bản sao kiểm thử touch được bỏ qua trên cấu hình desktop, kiểm thử tương ứng đã đạt trên mobile.
- Axe: không có vi phạm được phát hiện trong bộ quy tắc WCAG A/AA được chạy trên bốn route ở desktop/mobile. Đây là kết quả tự động, không phải chứng nhận toàn bộ WCAG.
- Các route không tràn ngang tại 320, 390, 768, 1024 và 1440px.
- Luồng nộp bài, nháp sau reload, file hỗ trợ/tệp sai định dạng, thưởng một lần, tìm/lọc/xem bài, xuất dữ liệu, hủy reset, focus modal, localStorage hỏng và hết dung lượng: đã kiểm tra.
- Nút xoay thay đổi ảnh render; CDP touch drag trên mô hình vẫn cuộn được trang trong cấu hình mobile.
- Production preview trả HTTP 200, tải mô hình và nộp bài nhận modal thưởng; không có lỗi JavaScript trong smoke test.
- `npm audit`: 0 lỗ hổng tại thời điểm kiểm tra.
- Sau sửa cuối: build và 6 kiểm thử có liên quan (nộp bài/phần thưởng, accessible name, axe, điều khiển 3D và lối tắt mobile) đều đạt.
- Console error captures: không có lỗi trên các route/trạng thái đã chụp.

Full review ban đầu đưa ra hai sửa đổi cục bộ, đã được giải quyết. Verdict cuối là **ship** ở phạm vi hai sửa đổi đó; không biến verdict này thành tuyên bố chứng nhận mọi hành vi trên mọi trình duyệt.

## Tài liệu hệ thống thiết kế

`DESIGN.md` và `.impeccable/design.json` đã được trích xuất sau khi hoàn thành review. Đối chiếu xác nhận 21 màu, 7 bước spacing, các token radius/type và tham chiếu thành phần khớp CSS. Sidecar schema v2 đọc được bằng JSON và có 10 mẫu thành phần độc lập. Không có thay đổi mã UI sau khi chụp ảnh/review cuối.

## Bằng chứng và giới hạn

Ảnh trong `.impeccable/review/`: desktop, mobile, tablet, small-mobile, collection, journal, settings; trạng thái lỗi, upload, phần thưởng, đã nhận mảnh, không có kết quả, form mobile, hướng dẫn và hoàn thành thế giới. Các ảnh viewport của modal/form mobile được phân biệt với ảnh full-page từ đầu trang.

Trình duyệt kiểm thử: Chromium, render WebGL bằng SwiftShader; mobile là cấu hình iPhone 13 và touch tổng hợp qua CDP. Chưa kiểm tra trên điện thoại thật, Safari hoặc bằng trình đọc màn hình thật. CUA không có browser/app khả dụng nên dùng Playwright độc lập. Không có live overlay hoặc live server của detector được khởi chạy; không có script injection cần gỡ. Hook Impeccable có sẵn báo 0 lỗi xác định trên các tệp UI đã quét; không chạy detector trùng lặp. Assessment A không đọc kết quả audit/test trước khi đưa ra critique.

Three.js được tách khỏi bundle ứng dụng và render theo thay đổi; chunk engine khoảng 131KB gzip vẫn phát sinh cảnh báo kích thước của Vite. Hình học thủ tục không thay thế artwork Blender/GLB của phase 2. LocalStorage không đồng bộ, không xác thực thời gian server và không bảo đảm giao dịch đồng thời giữa các tab. Hỗ trợ TXT/Markdown; PDF/DOCX và backend thuộc giai đoạn sau.
