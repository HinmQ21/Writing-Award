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
    if (signal.aborted) throw new DOMException('Stopped waiting for results.', 'AbortError');
    if ([502, 503, 504].includes(response.status)) throw new Error(`Review connection was interrupted or timed out (HTTP ${response.status}). Your draft is still saved; please try again.`);
    if (response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('Connection lost before review completed. Your draft is still saved; please try again.');
    if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Review API is not ready. Please run `npm run dev` in your terminal or press Ctrl + F5 if you are on the web.');
    }
    throw new Error('Review API is not ready. Please run npm run dev or use a deployment with an API.');
  }
  if (status < 200 || status >= 300) {
    const message = (data as { error?: unknown })?.error;
    throw new Error(typeof message === 'string' ? message : `Could not review piece (HTTP ${status}). Your draft is still saved; please try again.`);
  }
  const result = data as ScoringResult;
  if (!['scored', 'partial', 'needs_input', 'review_required'].includes(result.status) || !result.request_id || !Array.isArray(result.quality_flags)) throw new Error('API returned incomplete results. Please try again.');
  return result;
}
export async function readTaskImage(file: File): Promise<TaskImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, or WebP image, up to 2 MB.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read image. Please choose another file.'));
    reader.readAsDataURL(file);
  });
  return { mime_type: file.type as TaskImage['mime_type'], data };
}
