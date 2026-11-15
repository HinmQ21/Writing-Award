import { handleScoring } from './http';
import type { ScoringEnv } from './http';
import type { Generate } from './gemini';
import { reviewWriting } from './corrections';

export function handleCorrections(request: Request, env: ScoringEnv, generate?: Generate, log?: (event: object) => void) {
  return handleScoring(request, env, generate, log, (raw, options) => reviewWriting(raw, { ...options, examinerModel: env.GEMINI_FEEDBACK_MODEL || env.GEMINI_EXAMINER_MODEL || env.GEMINI_ANALYZER_MODEL || 'gemini-3.5-flash-lite' }));
}
