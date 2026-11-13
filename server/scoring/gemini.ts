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
    if (!apiKey) throw new ProviderError('not_configured', 'The scoring service has not been configured with a GEMINI_API_KEY on the server.');
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
      if (request.signal?.aborted) throw new ProviderError('timeout', 'Scoring took too long. Your essay is safe; feel free to try again.');
      throw new ProviderError('unavailable', 'Could not connect to the scoring service. Please try again later.');
    }
    if (!response.ok) {
      if (response.status === 429) throw new ProviderError('rate_limited', 'The service has run out of its quota or is receiving too many requests. Please try again later.', response.status);
      if (response.status >= 500) throw new ProviderError('unavailable', `Gemini is temporarily overloaded (HTTP ${response.status}). Your essay is safe; please try again later.`, response.status);
      throw new ProviderError('unavailable', `Gemini service is not ready (HTTP ${response.status}). Please check your API key and model permissions on the server.`);
    }
    const body = await response.json();
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new ProviderError('invalid_response', 'The service did not return complete scoring results. Please try again.');
    const raw = candidate.content?.parts?.filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought).map((p: { text: string }) => p.text).join('');
    try { return JSON.parse(raw); } catch { throw new ProviderError('invalid_response', 'AI result is not in valid JSON format. Please try again.'); }
  };
}
