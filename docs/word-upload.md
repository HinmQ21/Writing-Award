# Nhập bài viết từ Word

Cập nhật theo yêu cầu ngày 10/11/2026.

## Hành vi

- Chọn tệp hoặc kéo thả **Word .docx**, TXT, Markdown vào tab **Tải tệp lên**.
- Giới hạn 5 MB mỗi tệp và 100.000 ký tự văn bản sau khi đọc.
- Trích xuất văn bản, giữ Unicode và đoạn văn, chuyển sang ô soạn để xem/sửa trước khi lưu. Dạng Task 1/2 đang chọn được giữ nguyên; số từ được tính lại từ nội dung vừa đọc.
- Có trạng thái đang đọc, thông báo tên tệp và focus vào ô soạn sau thành công. Việc đọc tệp chưa nộp bài, chưa cộng chuỗi hoặc thưởng mảnh.
- Lỗi tệp, nội dung trống, quá dài hoặc quá dung lượng không thay thế bản nháp hiện có. Có thể chọn lại cùng tệp hoặc thử tệp khác.
- `.doc` nhị phân cũ chưa được hỗ trợ: mở trong Word và **Lưu dưới dạng → .docx**. Tệp có mật khẩu cần lưu một bản không đặt mật khẩu. PDF vẫn cần dán nội dung trực tiếp.

## Kỹ thuật

`src/uploads.ts` kiểm tra định dạng, kích thước và nội dung. `src/word.worker.ts` dùng [Mammoth extractRawText](https://github.com/mwilliamson/mammoth.js#library) để lấy văn bản trong worker riêng; không chuyển sang HTML, không render ảnh hoặc nội dung nhúng. Chỉ tải bộ đọc khi nhập Word. Tệp được xử lý trên trình duyệt, không gửi lên dịch vụ chuyển đổi.

Worker có timeout 15 giây, bị dừng sau khi xử lý, khi chọn tệp thay thế hoặc khi rời khung viết. Khi đang đọc, ô soạn ở trạng thái chỉ đọc và không thể nộp bài; kết quả cũ bị hủy không được ghi đè kết quả mới.

## Kiểm chứng

- TypeScript và build production: đạt. Worker nằm trong chunk riêng, khoảng 311 KB trước gzip, không cộng toàn bộ bộ đọc vào bundle mở trang.
- 20 unit test đạt (12 quy tắc học tập + 8 kiểm tra file/giới hạn/hủy đọc).
- Toàn bộ Playwright: 47 kiểm thử đạt, 1 kiểm thử touch trùng lặp trên desktop được bỏ qua; bản mobile tương ứng đạt.
- 8 kiểm thử Word trên Chromium desktop/mobile giả lập: đọc OOXML thật 276 từ, giữ tiếng Việt và đoạn văn, giữ Task, chỉnh sửa/nộp/xem nhật ký, lỗi/rỗng/quá dài, `.doc` cũ, tệp quá lớn, kéo thả và tên tệp dài ở giao diện tối.
- Axe không phát hiện vi phạm trong bộ WCAG A/AA được chạy ở trạng thái nhập thành công sáng/tối. Không tràn ngang với tên tệp dài trong cấu hình mobile đã kiểm tra.
- Production preview đọc đúng toàn bộ văn bản fixture Word và đếm 276 từ; không có lỗi JavaScript trong lượt kiểm tra này. `npm audit` báo 0 lỗ hổng tại thời điểm kiểm tra.
- Đã xem ảnh khung nhập và toàn trang ở cả hai giao diện, desktop/mobile. Ảnh trong `.impeccable/review/word-*.png`; chụp lại bằng `node scripts/capture-word.mjs` khi server đang chạy.

Fixture OOXML có nguồn tạo trong `tests/fixtures/make_docx.py`; không dùng kết quả parser giả lập. Chưa kiểm tra trên thiết bị iPhone/Safari vật lý. Chỉ giữ văn bản bài viết, không giữ nguyên định dạng trình bày Word.
