import { scoreWriting } from './engine';
import { createGemini, ProviderError } from './gemini';
import type { Generate } from './gemini';
import { InputError, MAX_BODY_BYTES } from './schemas';

export type ScoringEnv = { GEMINI_API_KEY?: string; GEMINI_ANALYZER_MODEL?: string; GEMINI_EXAMINER_MODEL?: string; GEMINI_EXAMINER_FALLBACK_MODEL?: string };
export const responseJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function handleScoring(request: Request, env: ScoringEnv, generate?: Generate, log: (event: object) => void = event => console.info(JSON.stringify(event))): Promise<Response> {
  if (request.method === 'GET') return responseJson({ configured: !!env.GEMINI_API_KEY });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return responseJson({ error: 'Yêu cầu phải được gửi từ ứng dụng này.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return responseJson({ error: 'Yêu cầu cần định dạng application/json.' }, 415);
  const deadline = AbortSignal.timeout(55_000);
  try {
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return responseJson({ error: 'Dữ liệu vượt quá 3 MB.' }, 413);
    const reader = request.body?.getReader();
    if (!reader) throw new InputError('Yêu cầu chưa có nội dung.');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return responseJson({ error: 'Dữ liệu vượt quá 3 MB.' }, 413); }
      chunks.push(value);
    }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('Nội dung JSON không hợp lệ.'); }
    return responseJson(await scoreWriting(raw, { generate: generate ?? createGemini(env.GEMINI_API_KEY), analyzerModel: env.GEMINI_ANALYZER_MODEL, examinerModel: env.GEMINI_EXAMINER_MODEL, examinerFallbackModel: env.GEMINI_EXAMINER_FALLBACK_MODEL, signal: AbortSignal.any([deadline, request.signal]), log }));
  } catch (error) {
    if (error instanceof InputError) return responseJson({ error: error.message, code: 'invalid_input' }, 400);
    if (error instanceof ProviderError) return responseJson({ error: error.message, code: error.code }, error.code === 'not_configured' ? 503 : error.code === 'rate_limited' ? 429 : error.code === 'timeout' ? 504 : 502);
    log({ event: 'scoring_error', code: 'internal_error' });
    return responseJson({ error: 'Chưa chấm được bài lúc này. Nội dung của bạn vẫn được giữ; hãy thử lại.', code: 'internal_error' }, 500);
  }
}
