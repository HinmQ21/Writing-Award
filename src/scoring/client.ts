import type { ScoringInput, ScoringResult, TaskImage } from './types';

export async function submitScoring(input: ScoringInput, signal: AbortSignal): Promise<ScoringResult> {
  const response = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  let data: unknown;
  let status = response.status;
  try {
    if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing stream');
      const decoder = new TextDecoder(); let buffer = '', completed = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        if (done && buffer.trim()) { lines.push(buffer); buffer = ''; }
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'result') { data = event.data; status = event.status; completed = true; }
        }
        if (done) break;
      }
      if (!completed) throw new Error('Incomplete scoring stream');
    } else data = await response.json();
  } catch {
    if (signal.aborted) throw new DOMException('Đã dừng chờ kết quả.', 'AbortError');
    if ([502, 503, 504].includes(response.status)) throw new Error(`Kết nối chấm bài bị gián đoạn hoặc quá thời gian (HTTP ${response.status}). Bài viết vẫn được giữ; hãy thử lại.`);
    if (response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('Kết nối bị ngắt trước khi chấm xong. Bài viết vẫn được giữ; hãy thử lại.');
    if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('API chấm bài chưa sẵn sàng. Hãy chạy lại `npm run dev` trong terminal hoặc nhấn Ctrl + F5 nếu đang mở trên web.');
    }
    throw new Error('API chấm bài chưa sẵn sàng. Hãy chạy npm run dev hoặc dùng bản triển khai có API.');
  }
  if (status < 200 || status >= 300) {
    const message = (data as { error?: unknown })?.error;
    throw new Error(typeof message === 'string' ? message : `Chưa chấm được bài (HTTP ${status}). Bài viết vẫn được giữ; hãy thử lại.`);
  }
  const result = data as ScoringResult;
  if (!['scored', 'partial', 'needs_input', 'review_required'].includes(result.status) || !result.request_id || !Array.isArray(result.quality_flags)) throw new Error('API trả về kết quả chưa đầy đủ. Hãy thử lại.');
  return result;
}
export async function readTaskImage(file: File): Promise<TaskImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) throw new Error('Chọn ảnh PNG, JPEG hoặc WebP, tối đa 2 MB.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Chưa đọc được ảnh. Hãy chọn lại tệp.'));
    reader.readAsDataURL(file);
  });
  return { mime_type: file.type as TaskImage['mime_type'], data };
}
