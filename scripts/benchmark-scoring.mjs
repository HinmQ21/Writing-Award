import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const common = ['coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'];
const validBand = band => typeof band === 'number' && Number.isFinite(band) && band >= 0 && band <= 9 && band * 2 % 1 === 0;
/** Evaluate saved API results against human reference scores; never makes AI calls. */
export function benchmarkScoring(dataset) {
  if (!Array.isArray(dataset.cases) || !dataset.cases.length) throw new Error('Dataset needs nonempty cases with id, task_type, essay, reference and runs[].');
  const metrics = {}, spreads = [];
  let totalRuns = 0, scoredRuns = 0, rejectedRuns = 0, quotes = 0, invalidQuotes = 0;
  let repeatedCases = 0, stableCases = 0;
  const ids = new Set();
  for (const item of dataset.cases) {
    if (!item.id || ids.has(item.id)) throw new Error('Every case needs a unique id.');
    ids.add(item.id);
    if (!['academic_task_1', 'academic_task_2', 'general_task_1', 'general_task_2'].includes(item.task_type) || typeof item.essay !== 'string' || !Array.isArray(item.runs) || !item.runs.length) throw new Error(`Invalid case: ${item.id}`);
    const keys = [item.task_type.endsWith('_1') ? 'task_achievement' : 'task_response', ...common];
    if (keys.some(key => !validBand(item.reference?.[key]))) throw new Error(`Case ${item.id} needs four valid human reference bands.`);
    const accepted = [];
    for (const run of item.runs) {
      totalRuns++;
      if (run.task_type !== item.task_type || run.status !== 'scored' || keys.some(key => !validBand(run.criteria?.[key]?.band))) { rejectedRuns++; continue; }
      scoredRuns++; accepted.push(run);
      for (const key of keys) {
        metrics[key] ??= { observations: 0, absolute_error_sum: 0, within_half_band_count: 0 };
        const metric = metrics[key], error = Math.abs(run.criteria[key].band - item.reference[key]);
        metric.observations++; metric.absolute_error_sum += error; metric.within_half_band_count += Number(error <= 0.5);
        const evidence = run.criteria[key].evidence_quotes;
        if (!Array.isArray(evidence) || (run.criteria[key].band > 0 && !evidence.length)) { invalidQuotes++; quotes++; }
        else for (const quote of evidence) { quotes++; if (typeof quote !== 'string' || !quote.trim() || !item.essay.includes(quote)) invalidQuotes++; }
      }
    }
    if (accepted.length >= 2) {
      repeatedCases++;
      const ranges = keys.map(key => { const bands = accepted.map(run => run.criteria[key].band); return Math.max(...bands) - Math.min(...bands); });
      if (ranges.every(range => range === 0)) stableCases++;
      spreads.push({ id: item.id, repeats: accepted.length, criterion_band_ranges: Object.fromEntries(keys.map((key, i) => [key, ranges[i]])) });
    }
  }
  return {
    cases: dataset.cases.length, total_runs: totalRuns, scored_runs: scoredRuns, rejected_or_incomplete_runs: rejectedRuns,
    scored_coverage: totalRuns ? scoredRuns / totalRuns : null,
    criteria: Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, { observations: metric.observations, mae: metric.absolute_error_sum / metric.observations, within_0_5_rate: metric.within_half_band_count / metric.observations }])),
    evidence: { quote_count: quotes, invalid_quote_count: invalidQuotes, invalid_quote_rate: quotes ? invalidQuotes / quotes : null },
    stability: { repeated_cases: repeatedCases, identical_criteria_rate: repeatedCases ? stableCases / repeatedCases : null, per_case: spreads },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: npm run benchmark:scoring -- path/to/human-reference-and-runs.json');
    console.log(JSON.stringify(benchmarkScoring(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
