import { handleScoring } from '../../server/scoring/http';
export default (request: Request) => handleScoring(request, process.env);
export const config = { path: '/api/score' };
