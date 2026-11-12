import type { Connect, Plugin } from 'vite';
import { handleScoring, responseJson } from './scoring/http';
import type { ScoringEnv } from './scoring/http';
import { MAX_BODY_BYTES } from './scoring/schemas';

function createScoringMiddleware(env: ScoringEnv): Connect.NextHandleFunction {
  return async (incoming, outgoing) => {
    try {
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { outgoing.writeHead(413, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ error: 'Dữ liệu vượt quá 3 MB.' })); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const url = `http://${incoming.headers.host ?? 'localhost:5173'}/api/score`;
      const request = new Request(url, { method: incoming.method, headers, ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks).toString('utf8') } : {}) });
      const activeEnv: ScoringEnv = { ...env, ...process.env };
      const response = await handleScoring(request, activeEnv);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
    } catch {
      const response = responseJson({ error: 'Chưa xử lý được yêu cầu chấm bài.' }, 500);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
    }
  };
}

export function scoringApi(env: ScoringEnv): Plugin {
  return {
    name: 'writing-scoring-api',
    configureServer(server) {
      server.middlewares.use('/api/score', createScoringMiddleware(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/score', createScoringMiddleware(env));
    },
  };
}
