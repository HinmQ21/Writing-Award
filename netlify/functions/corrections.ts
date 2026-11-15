import { handleCorrections } from '../../server/scoring/corrections-http';
import { streamScoring } from '../../server/scoring/stream';
export default (request: Request) => request.method === 'POST' ? streamScoring(request, process.env, handleCorrections) : handleCorrections(request, process.env);
export const config = { path: '/api/corrections' };
