# IELTS Writing scoring — implementation v1.1

## Chạy và sử dụng

1. Cài dependencies: `npm install`.
2. Đặt `GEMINI_API_KEY` trong `.env` ở root. Khóa chỉ được đọc trong server, không đặt tiền tố `VITE_`. `.env` nằm trong `.gitignore`.
3. Chạy `npm run dev`, mở `http://localhost:5173/#scoring` và chọn **Chấm bài IELTS**. Sau khi thay `.env`, khởi động lại dev server.

Có thể mở bài từ Nhật ký rồi chọn **Chấm bài viết này**, hoặc lấy nháp từ góc luyện viết. Cần bổ sung đề gốc. Chấm bài không thay đổi mảnh thưởng hay chuỗi ngày. Bản nháp đề/bài được giữ trong sessionStorage của tab; ảnh và kết quả chỉ ở bộ nhớ của trang. Không triển khai tài khoản hay lịch sử chấm riêng. Tải JSON trước khi rời trang nếu muốn giữ kết quả.

Ở màn hình chấm, **Chọn bài từ nhật ký** cho phép tìm theo tiêu đề/nội dung và lọc Task 1/2. Chọn bài giữ nguyên nhật ký, thay nội dung trong form và xóa đề/ảnh cũ để tránh chấm nhầm. Nhật ký cũng có nút **Chấm bài** riêng trên từng dòng. Home có lựa chọn **Nhận đánh giá IELTS cho bài này**: lưu bài/nhận phần thưởng trước, bấm **Tiếp tục chấm bài** để bổ sung đầy đủ đề gốc, loại bài, dạng đề và ảnh nếu cần. Không tự gọi AI khi tick checkbox hoặc lưu bài. Các menu loại bài/dạng đề hỗ trợ phím mũi tên, Home/End, Enter và Escape, có selected state và giao diện sáng/tối.

UI dùng `impeccable` và `ui-ux-pro-max`, kế thừa ivory/lavender/Capy, Nunito/Nunito Sans và semantic token hiện tại. Desktop đặt bài gốc cạnh nhận xét; mobile ưu tiên kết quả sau khi chấm. Tab tiêu chí hỗ trợ phím mũi tên/Home/End; bấm trích dẫn để tô sáng đúng đoạn trong bài gốc. Nội dung gửi tới Gemini được thông báo ngay cạnh nút chấm; band luôn là ước lượng.

## API

`GET /api/score` trả `{ "configured": true|false }`, không trả khóa.

`POST /api/score`, `Content-Type: application/json`:

```json
{
  "task_type": "academic_task_2",
  "question_category": "auto",
  "question": "<full writing prompt>",
  "essay": "<original candidate text>",
  "task_image": null,
  "rubric_version": "ielts_official_v1"
}
```

- 4 task type và 14 category theo tài liệu thiết kế. General Task 1 dùng `question_category: null` (`auto` cũng được chuẩn hóa thành null).
- Ảnh Academic Task 1: `{ "mime_type": "image/png", "data": "<base64 without data URL prefix>" }`. PNG/JPEG/WebP tối đa 2 MiB, kiểm tra chữ ký tệp tại server. Không tải ảnh từ URL bên ngoài.
- Đề tối đa 12.000 ký tự, bài tối đa 100.000 ký tự, toàn bộ request tối đa 3 MiB. Thiếu nội dung, task/category/rubric sai trả 400 trước AI call.
- Kết quả có đầy đủ trường trong v1.1, thêm phân tích đề, yêu cầu đề, ngữ cảnh thiếu, model phân tích, `prompt_version`, `request_id`, `scored_at`, `rounding_rule`.
- `criteria` là null nếu cả kết quả chưa vượt qua kiểm tra cấu trúc/bằng chứng. Nếu chỉ một tiêu chí chưa đủ ngữ cảnh, giữ đủ 4 tiêu chí, `band: null` tại tiêu chí đó. Không xuất band tổng cho `partial`, `needs_input`, `review_required`.
- Thiếu ảnh Academic Task 1 luôn vô hiệu hóa Task Achievement và band tổng, kể cả khi model trả band đầy đủ.
- HTTP: 400 dữ liệu lỗi, 403 origin khác, 405 sai method, 413 quá lớn, 415 sai content type, 429 hết hạn mức, 502 lỗi upstream/JSON, 503 chưa cấu hình, 504 quá thời gian. Không trả raw upstream response hoặc khóa trong lỗi.

## Pipeline và rubric

1. Code kiểm tra input và đếm từ theo cùng quy tắc Unicode với góc luyện viết. Không chặn bài thiếu 150/250 từ và không trừ band tự động.
2. `gemini-3.5-flash-lite` phân tích đề + category/checklist. Analyzer chỉ nhận đề và ảnh, không cần gửi bài viết. Category hint không được xem là ground truth.
3. `gemini-3.8-flash` nhận đề gốc, bài gốc, ảnh nếu có, phân tích và rubric chính thức đúng Task 1/2. Checklist không tạo thang điểm hay penalty riêng.
4. AJV kiểm tra JSON Schema, đúng 4 tiêu chí, band 0–9 bước 0.5, quote đúng từng ký tự trong bài gốc. Band lớn hơn 0 phải có ít nhất một bằng chứng. Các ràng buộc độ dài/count/range được giữ ở validator; schema gửi Gemini được giản lược để giảm độ phức tạp constrained decoding, vẫn giữ cấu trúc, trường bắt buộc và enum.
5. Chỉ khi có lỗi hay dấu hiệu mâu thuẫn: Flash-Lite audit, chỉ gắn cờ. Lỗi cứng không thể được audit bỏ qua. Examiner chấm lại đúng tiêu chí bị gắn cờ tối đa một lần; band còn lại giữ nguyên. Nếu còn lỗi trả `review_required`.
6. Code lấy trung bình 4 band, làm tròn gần nhất 0.5, trường hợp nằm giữa làm tròn lên: 6.25 → 6.5, 6.75 → 7.0. Không tính Writing module band Task 1 + Task 2.

Mặc định 2 model calls; audit và reassess làm tối đa 4 model calls. Khi bật overload fallback có thêm tối đa một attempt (tối đa 5 attempts), không tăng số lần reassess. Deadline cả request 55 giây áp dụng chung cả fallback. System instruction tách khỏi dữ liệu đề/bài/ảnh và yêu cầu bỏ qua mọi chỉ dẫn nhúng trong dữ liệu. Đây là biện pháp giảm prompt injection, không phải bảo đảm tuyệt đối trước mọi nội dung đối kháng.

Rubric `server/rubrics/ielts-official-v1.json` được trích theo từng ô tiêu chí/band từ bản **Updated May 2023** của [IELTS Writing Band Descriptors](https://ielts.org/cdn/Guides/ielts-writing-band-descriptors.pdf). PDF gốc được giữ ở `server/rubrics/source.pdf`; SHA-256 nằm trong JSON để kiểm tra tính toàn vẹn. Cả Task 1 (Academic + General) và Task 2 có đủ bands 0–9. Model không tự tạo rubric. Khi cập nhật nguồn, tạo rubric version mới và chạy lại benchmark; không thay nội dung âm thầm dưới cùng version.

Model/config mặc định đúng thiết kế. Theo yêu cầu bổ sung của người dùng ngày 2026-11-12, cho phép Flash-Lite chấm trong vai Examiner khi Flash quá tải hoặc được chọn trực tiếp. Cấu hình **phía server**:

```env
GEMINI_ANALYZER_MODEL=gemini-3.5-flash-lite
GEMINI_EXAMINER_MODEL=gemini-3.8-flash
GEMINI_EXAMINER_FALLBACK_MODEL=gemini-3.5-flash-lite
```

Chỉ HTTP 429/503 của Examiner mới kích hoạt fallback, tối đa một lần trong cả pipeline. Không fallback do lỗi key/quyền truy cập, JSON sai, hoặc timeout đã hết deadline. Model fallback tiếp tục làm Examiner khi cần chấm lại; audit vẫn chỉ gắn cờ. Để trống fallback để tắt; có thể đặt model chính thành Flash-Lite để dùng trực tiếp. `examiner_model` phản ánh Examiner trả kết quả cuối cùng và `examiner_models_used` liệt kê các Examiner đã trả kết quả trong pipeline; event `scoring_model_fallback` ghi model nguồn/đích và HTTP status. Nếu cả hai quá tải trả lỗi và giữ nháp. Không giả định model nhỏ đạt độ chính xác như model chính; cần benchmark mỗi cấu hình. Tham khảo [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) và [GenerateContent API](https://ai.google.dev/api/generate-content).

Log JSON tại server gồm request ID, stage/model/version, kết quả phân tích/chấm và evidence, validation issues, số calls và hash đề/bài/rubric. Không log API key hoặc ảnh; kết quả log có các đoạn trích từ bài, nên cần quản lý quyền truy cập/lưu trữ log phù hợp ở môi trường triển khai.

## Triển khai

Vite plugin trong `server/vite-scoring.ts` phục vụ API khi chạy dev. Production có Netlify Function `netlify/functions/score.ts`, route `/api/score`, Node 22 và JSON rubric được bundle bằng esbuild, theo [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/). Khai báo khóa và các biến model/fallback trong environment của Netlify Functions rồi redeploy. `npm run build` chỉ tạo frontend `dist/`; `npm run preview` hay một static host thuần không chạy API. Chưa deploy lên website hiện tại trong tác vụ này.

Chưa có auth, durable rate limiting hoặc quota theo người dùng; nếu mở public cần cấu hình bảo vệ ở hosting/gateway. Việc triển khai các phần này không nằm trong module chấm một bài của tài liệu.

## Kiểm thử và benchmark

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests kiểm tra làm tròn, category/thư, input và ảnh lỗi, evidence sai, thiếu tiêu chí, audit không được sửa điểm, chấm lại đúng tiêu chí/tối đa một lần, thiếu ảnh, JSON lỗi, quota và bảo vệ key. Playwright dùng mock API (không tốn lượt AI) cho trạng thái đầy đủ, một phần, lỗi, loading/cancel, upload, nháp, liên kết Nhật ký, phím tắt tiêu chí, export, light/dark, reflow và axe. Ảnh QA ở `.impeccable/review/scoring-*.png` dùng fixture điểm để kiểm tra giao diện, không phải bằng chứng độ chính xác chấm.

Đánh giá chất lượng bằng bài có reference thật từ giáo viên/giám khảo. Lưu JSON theo cấu trúc sau (`reference` phải đủ 4 tiêu chí đúng task, `runs` là một hoặc nhiều kết quả API nguyên bản):

```text
{
  "cases": [{
    "id": "unique-human-rated-essay-id",
    "task_type": "academic_task_2",
    "essay": "original text",
    "reference": { "task_response": <band>, "coherence_cohesion": <band>,
                   "lexical_resource": <band>, "grammatical_range_accuracy": <band> },
    "runs": [<saved ScoringResult>, <repeat ScoringResult>]
  }]
}
```

```sh
npm run benchmark:scoring -- path/to/dataset.json
```

Runner không gọi AI; tính MAE từng tiêu chí, tỷ lệ lệch ≤0.5, khoảng dao động qua các lần chấm, tỷ lệ các band giữ nguyên, tỷ lệ quote sai và coverage/scored vs rejected runs. Không coi kết quả chưa đầy đủ là band 0. Chưa có dữ liệu reference của giáo viên trong repo nên **chưa đo/calibrate độ chính xác band thực tế**. Không tự nhận kết quả chính thức hoặc chất lượng tương đương giám khảo.
