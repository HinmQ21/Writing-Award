import { handleScoring } from './http';
import type { ScoringEnv } from './http';

// Headers and heartbeat bytes reach intermediaries while Gemini is working.
// Final HTTP status lives in the result envelope because headers are already sent.
export function streamScoring(request: Request, env: ScoringEnv, handler = handleScoring): Response {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const encoder = new TextEncoder(), abort = new AbortController();
  const upstream = new Request(request, { signal: AbortSignal.any([request.signal, abort.signal]) });
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: object) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      send({ type: 'keepalive' });
      heartbeat = setInterval(() => send({ type: 'keepalive' }), 5000);
      void (async () => {
        try {
          const response = await handler(upstream, env);
          send({ type: 'result', status: response.status, data: await response.json() });
        } catch {
          send({ type: 'result', status: 500, data: { error: 'Scoring session not completed. Your essay is safe; please try again.', code: 'stream_error' } });
        } finally {
          clearInterval(heartbeat);
          if (!closed) { closed = true; controller.close(); }
        }
      })();
    },
    cancel() { closed = true; clearInterval(heartbeat); abort.abort(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff' } });
}
