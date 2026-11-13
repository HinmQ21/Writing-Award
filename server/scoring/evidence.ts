type Schema = { properties?: Record<string, Schema>; required?: string[]; [key: string]: unknown };
type SourceEvidence = { id: string; text: string };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// Every option is sliced from the original essay. Never correct, lowercase,
// normalize whitespace, or match a model's paraphrase to a different passage.
export function sourceEvidence(essay: string): SourceEvidence[] {
  const excerpts: string[] = [];
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(essay)) {
    let remaining = segment.trim();
    while (remaining.length > 2000) {
      let end = remaining.lastIndexOf(' ', 2000);
      if (end < 1000) end = 2000;
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
      excerpts.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
    if (remaining) excerpts.push(remaining);
  }
  return excerpts.map((text, index) => ({ id: `s${index + 1}`, text }));
}

// Use constrained source IDs on the model wire, keeping evidence_quotes in the
// public result and the strict validator. This also applies to focused rechecks.
export function prepareEvidence(schema: object, data: unknown) {
  if (!isRecord(data) || typeof data.original_essay !== 'string') return null;
  const sourceCriteria = (schema as Schema).properties?.criteria?.properties;
  if (!sourceCriteria || !Object.values(sourceCriteria).every(item => item.properties?.evidence_quotes)) return null;
  const sources = sourceEvidence(data.original_essay);
  if (!sources.length) return null;
  const wireSchema = structuredClone(schema) as Schema;
  for (const item of Object.values(wireSchema.properties!.criteria.properties!)) {
    const { evidence_quotes: quotes, ...properties } = item.properties!;
    item.properties = { ...properties, evidence_ids: { ...quotes, items: { type: 'string', enum: sources.map(source => source.id) } } };
    item.required = item.required?.map(key => key === 'evidence_quotes' ? 'evidence_ids' : key);
  }
  const byId = new Map(sources.map(source => [source.id, source.text]));
  return {
    schema: wireSchema,
    data: { ...data, original_evidence: sources },
    instruction: `Evidence transport: The response schema uses evidence_ids INSTEAD OF evidence_quotes. For each criterion, select 1 to 3 relevant IDs from original_evidence, or an empty array only if the criterion is unassessable or band 0. The server will copy those exact original excerpts into evidence_quotes. Never invent an ID, output quote text in evidence_ids, or correct the source excerpts. Read the full original essay and assess all criteria normally; these IDs select evidence only and do not determine bands.`,
    resolve(value: unknown): unknown {
      if (!isRecord(value) || !isRecord(value.criteria)) return value;
      const criteria = Object.fromEntries(Object.entries(value.criteria).map(([key, item]) => {
        if (!Object.hasOwn(sourceCriteria, key)) return [key, item]; // Let the full schema reject unknown criteria.
        if (!isRecord(item) || !Array.isArray(item.evidence_ids) || 'evidence_quotes' in item) throw new Error('Missing evidence IDs.');
        const { evidence_ids, ...rest } = item;
        const quotes = evidence_ids.map(id => {
          if (typeof id !== 'string' || !byId.has(id)) throw new Error('Unknown evidence ID.');
          return byId.get(id)!;
        });
        return [key, { ...rest, evidence_quotes: quotes }];
      }));
      return { ...value, criteria };
    },
  };
}
