# Kiểm tra lỗi chấm bài trên Netlify — 2026-11-13

Site: https://writing-award-capy.netlify.app/#scoring

## Bằng chứng từ production

- `GET /api/score`: HTTP 200, `{"configured":true}`. Function có route và có biến key; health check không xác minh tính hợp lệ của key hay các biến model.
- `POST /api/score` với `{}`: HTTP 400 JSON từ validator. Function được gọi và xử lý dữ liệu đúng đường dẫn.
- `POST` bài mẫu: HTTP 504 sau 30,7 giây, HTML có tiêu đề **Inactivity Timeout**, nội dung “Too much time has passed without sending any data for document.” Request ID: `01M78FP0C24YMV53R387RY8JHN`.
- Thử tiếp với bài ngắn 50 từ trên cùng production endpoint: HTTP 200 sau 27,2 giây, `status: scored`, band ước lượng 5.5. Request ID: `01M78FTZZ7SSMYC706AW36KJZ7`. Đây là bằng chứng Netlify gọi được Gemini và hoàn thành pipeline; không phải mọi request đều bị chặn mạng. Điểm chỉ để kiểm tra đường truyền, không phải benchmark chấm band.
- `/.netlify/functions/score` không phải route của function này vì đã khai báo custom path `/api/score`; ở site hiện tại URL đó trả SPA HTML.

Các quan sát xác nhận timeout do request chờ không có dữ liệu trả về trên đường đi đã kiểm tra. Chưa đủ bằng chứng xác định đó là Netlify CDN, proxy trung gian hay timeout cụ thể trong kết nối Gemini. Không có phiên đăng nhập/token Netlify để xem log hoặc đọc cấu hình model runtime. Các biến trong `.env` local không chứng minh cấu hình production giống nhau.

## Bản sửa trong repo

- Adapter Netlify trả streaming NDJSON, gửi frame keepalive ngay và mỗi 5 giây trong lúc chấm, sau đó frame result gồm `status` và `data`.
- Frontend đọc stream theo từng chunk UTF-8, bỏ qua keepalive và xử lý status/lỗi trong envelope. Vite dev vẫn dùng JSON thông thường. Với streaming, HTTP transport đã bắt đầu ở 200; mã trạng thái ứng dụng phải được đọc ở result envelope.
- Kết nối bị ngắt hoặc gateway trả HTML 502/503/504 được báo rõ, không còn rơi vào thông báo chung hoặc hướng dẫn chạy dev cho lỗi timeout production. Bản nháp được giữ nguyên.
- Giữ deadline 55 giây cho tác vụ; streaming không cho phép vượt giới hạn thực thi của hosting. [Netlify Functions API](https://docs.netlify.com/build/functions/api/) mô tả response stream và giới hạn 60 giây cho streaming functions.
- Test giữ kết nối, frame trạng thái lỗi, chunk UTF-8 bị chia nhỏ, stream ngắt, gateway HTML timeout, hủy request và tương thích JSON.
- `npm test`: 58 tests passed. `npm run build`: passed. Playwright streaming success/error scenario: passed desktop + mobile.

## Đưa lên production và xác minh tiếp

Cần redeploy **cả frontend và function** cùng nhau. Chưa deploy trong lượt kiểm tra này vì phiên Netlify CLI không có đăng nhập/token và không có browser session. Sau deploy, kiểm tra response `/api/score` có `Content-Type: application/x-ndjson`, frame keepalive tới đều và frame result kết thúc.

Trong Netlify, kiểm tra environment scope Functions/Production cho `GEMINI_API_KEY`, `GEMINI_ANALYZER_MODEL`, `GEMINI_EXAMINER_MODEL`, `GEMINI_EXAMINER_FALLBACK_MODEL`. Model đã chạy được với key local ở lượt trước là analyzer `gemini-2.5-flash-lite`, examiner `gemini-2.5-flash`. Không thay key hay biến production khi chưa đọc được cấu hình đó.

Nếu còn lỗi, xem **Cloud compute → Functions → score**, lọc request ID/thời gian; event `scoring_stage` cho biết request dừng ở analyze/examine/audit/reassess. [Hướng dẫn function logs](https://docs.netlify.com/build/functions/logs/).
