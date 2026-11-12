import { afterEach, expect, it, vi } from 'vitest';
import { streamScoring } from './stream';
import { submitScoring } from '../../src/scoring/client';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const request = () => new Request('https://example.netlify.app/api/score', { method: 'POST', body: '{}' });
it('sends heartbeat bytes immediately and during a slow invocation, then preserves the final status', async () => {
  vi.useFakeTimers();
  let finish!: (r: Response) => void;
  const response = streamScoring(request(), {}, () => new Promise(resolve => { finish = resolve; }));
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('keepalive');
  await vi.advanceTimersByTimeAsync(5000);
  expect(decoder.decode((await reader.read()).value)).toContain('keepalive');
  finish(Response.json({ error: 'Quota exhausted' }, { status: 429 }));
  const result = JSON.parse(decoder.decode((await reader.read()).value));
  expect(result).toEqual({ type: 'result', status: 429, data: { error: 'Quota exhausted' } });
  expect((await reader.read()).done).toBe(true);
});
it('client reads chunked UTF-8 results and ignores heartbeat events', async () => {
  const result = { status: 'scored', request_id: 'test', quality_flags: [], note: 'Tiếng Việt' };
  const bytes = new TextEncoder().encode(`${JSON.stringify({ type: 'keepalive' })}\n${JSON.stringify({ type: 'result', status: 200, data: result })}\n`);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3)); c.close(); } }), { headers: { 'content-type': 'application/x-ndjson' } })));
  expect(await submitScoring({} as never, new AbortController().signal)).toEqual(result);
});
it('client reports the API error within a streaming response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(`${JSON.stringify({ type: 'result', status: 429, data: { error: 'Hết hạn mức.' } })}\n`, { headers: { 'content-type': 'application/x-ndjson' } })));
  await expect(submitScoring({} as never, new AbortController().signal)).rejects.toThrow('Hết hạn mức.');
});
it('client reports an interrupted stream or HTML gateway timeout without losing the reason', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"type":"keepalive"}\n', { headers: { 'content-type': 'application/x-ndjson' } })));
  await expect(submitScoring({} as never, new AbortController().signal)).rejects.toThrow('Kết nối bị ngắt');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<h1>Inactivity Timeout</h1>', { status: 504, headers: { 'content-type': 'text/html' } })));
  await expect(submitScoring({} as never, new AbortController().signal)).rejects.toThrow('HTTP 504');
});
it('cancels the ongoing handler when the caller disconnects', async () => {
  let signal: AbortSignal | undefined;
  const response = streamScoring(request(), {}, req => { signal = req.signal; return new Promise(() => {}); });
  await response.body!.cancel(); expect(signal?.aborted).toBe(true);
});
