# Writing Award

Một bài viết, một mảnh hạnh phúc. Demo luyện IELTS Writing theo [thiết kế sản phẩm v2](docs/Writing_Award_UX_Design_v2.md).

## Chạy dự án

Cần Node.js 22.14+ và npm.

```sh
npm install
npm run dev
```

Mở địa chỉ localhost Vite in ra (mặc định http://localhost:5173).

```sh
npm run build
npm run preview
```

Build tĩnh nằm trong `dist/`.

## Chức năng

- Mô hình Three.js với ánh sáng, bóng đổ, xoay và zoom bằng nút hoặc chuột; render khi có thay đổi, không chạy vòng lặp 3D liên tục.
- Task 1 từ 150 từ, Task 2 từ 250 từ. Dán bài, tải Word `.docx` / TXT / Markdown, lưu nháp và nhật ký trên trình duyệt. Tệp tối đa 5 MB; nội dung tối đa 100.000 ký tự. Có thể xem/sửa văn bản trích xuất trước khi nộp.
- Một mảnh mỗi ngày theo múi giờ Việt Nam. Freeze, chuỗi, sao trang trí, ba thế giới với 21 mảnh mỗi thế giới; công trình đã xây không mất đi.
- Bộ sưu tập, tìm/lọc nhật ký, đọc và tải bài, âm thanh tùy chọn, tải bản sao dữ liệu JSON.
- Bản demo khởi tạo 12 bài mẫu; nhãn demo và đường dẫn bắt đầu hành trình riêng hiển thị trong giao diện. Chuyển thế giới mẫu chỉ hoạt động khi còn ở chế độ demo.
- Giao diện desktop hai cột, mobile mô hình trước khung viết, thanh điều hướng dưới và lối tắt “Viết hôm nay”.
- Chế độ Sáng / Tối / Theo hệ thống trong Cài đặt, nút đổi nhanh trên thanh trên; lưu lựa chọn và đổi ánh sáng 3D mà không mất góc nhìn hay bản nháp.

## Kiểm tra

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Playwright tự chạy server nếu chưa có. Kiểm tra Chromium desktop và thiết bị iPhone giả lập; kiểm tra bố cục 320, 390, 768, 1024, 1440 px, a11y bằng axe, luồng nộp bài, lưu nháp, dữ liệu lỗi, thao tác bàn phím và touch giả lập. Đây không phải kết quả kiểm tra trên iPhone/Safari vật lý.

Chụp ảnh QA khi server đang chạy:

```sh
node scripts/capture.mjs
node scripts/capture-states.mjs
```

Ảnh được lưu trong `.impeccable/review/`.

## Hệ thống thiết kế

`docs/` có quyền ưu tiên. ui-ux-pro-max cung cấp tra cứu font/interaction/spacing; impeccable định hướng triển khai, critique, audit và polish. Xem `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/dashboard.md`, `docs/critique-initial.md` và `docs/audit-initial.md`.

## Giới hạn bản demo

Chưa có tài khoản, backend, đồng bộ thiết bị, chấm điểm AI, phát hiện sao chép hoặc xác thực ngày trên server. LocalStorage có thể bị chỉnh sửa; tính thưởng không có bảo đảm giao dịch giữa các tab nộp đồng thời. Word `.docx` được đọc nội dung văn bản tại trình duyệt; tệp `.doc` cũ cần lưu lại thành `.docx`, tệp có mật khẩu cần bỏ mật khẩu trước khi nhập. PDF chưa được đọc trực tiếp; hãy dán nội dung hoặc chuyển thành TXT. Mô hình là geometry thủ tục của Three.js, chưa phải artwork Blender/GLB ở phase 2. Tải bản sao JSON để lưu trữ; khôi phục/import JSON chưa được triển khai.

## Tệp thiết kế nên lưu cùng mã nguồn

Giữ `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` và `.impeccable/surfaces/`. Ảnh QA/runtime được bỏ qua trong `.gitignore`; không bỏ qua toàn bộ `.impeccable/`.
