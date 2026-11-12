import type { ScoringInput, ScoringResult, TaskImage } from './types';

export async function submitScoring(input: ScoringInput, signal: AbortSignal): Promise<ScoringResult> {
  const response = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('API chấm bài chưa sẵn sàng. Hãy chạy npm run dev hoặc dùng bản triển khai có API.'); }
  if (!response.ok) throw new Error((data as { error?: string }).error || 'Chưa chấm được bài. Hãy thử lại.');
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
