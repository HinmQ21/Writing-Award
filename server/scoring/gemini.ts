import type { TaskImage } from '../../src/scoring/types';
export type ModelRequest = { model: string; system: string; data: unknown; schema: object; image?: TaskImage | null; signal?: AbortSignal; maxOutputTokens?: number };
export type Generate = (request: ModelRequest) => Promise<unknown>;
export class ProviderError extends Error {
  constructor(public code: 'not_configured' | 'unavailable' | 'rate_limited' | 'timeout' | 'invalid_response', message: string, public httpStatus?: number) { super(message); }
}
// Keep constrained decoding small. Full length, range, uniqueness and half-band
// constraints are enforced by the server's AJV validator, never delegated to AI.
export function generationSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(generationSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'multipleOf', 'uniqueItems'].includes(key)).map(([key, child]) => [key, generationSchema(child)]));
}
export function createGemini(apiKey: string | undefined, fetcher: typeof fetch = fetch): Generate {
  return async request => {
    if (!apiKey) throw new ProviderError('not_configured', 'Dịch vụ chấm bài chưa được cấu hình GEMINI_API_KEY trên server.');
    const parts: object[] = [{ text: JSON.stringify({ untrusted_candidate_data: request.data }) }];
    if (request.image) parts.push({ inlineData: { mimeType: request.image.mime_type, data: request.image.data } });
    let response: Response;
    try {
      response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: request.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: request.system }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: generationSchema(request.schema), temperature: 0.1, maxOutputTokens: request.maxOutputTokens ?? 8192 } }),
      });
    } catch {
      if (request.signal?.aborted) throw new ProviderError('timeout', 'Lượt chấm mất quá nhiều thời gian. Bài viết vẫn được giữ; bạn có thể thử lại.');
      throw new ProviderError('unavailable', 'Chưa kết nối được dịch vụ chấm bài. Hãy thử lại sau.');
    }
    if (!response.ok) {
      if (response.status === 429) throw new ProviderError('rate_limited', 'Dịch vụ đang hết hạn mức hoặc nhận quá nhiều yêu cầu. Hãy thử lại sau.', response.status);
      if (response.status >= 500) throw new ProviderError('unavailable', `Gemini đang tạm quá tải (HTTP ${response.status}). Bài viết vẫn được giữ; hãy thử lại sau.`, response.status);
      throw new ProviderError('unavailable', `Dịch vụ Gemini chưa sẵn sàng (HTTP ${response.status}). Hãy kiểm tra khóa API và quyền truy cập model trên server.`);
    }
    const body = await response.json();
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new ProviderError('invalid_response', 'Dịch vụ chưa trả kết quả chấm đầy đủ. Hãy thử lại.');
    const raw = candidate.content?.parts?.filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought).map((p: { text: string }) => p.text).join('');
    try { return JSON.parse(raw); } catch { throw new ProviderError('invalid_response', 'Kết quả AI chưa đúng định dạng JSON. Hãy thử lại.'); }
  };
}
