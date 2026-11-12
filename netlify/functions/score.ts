import { handleScoring } from '../../server/scoring/http';
import { streamScoring } from '../../server/scoring/stream';
export default (request: Request) => request.method === 'POST' ? streamScoring(request, process.env) : handleScoring(request, process.env);
export const config = { path: '/api/score' };
