import Ajv from 'ajv';
import { allowedCategories, criterionKeys, TASK_TYPES } from '../../src/scoring/types';
import type { ScoringInput, TaskType } from '../../src/scoring/types';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
const text = (maxLength = 4000) => ({ type: 'string', minLength: 1, maxLength });
const strings = (maxItems = 16) => ({ type: 'array', items: text(), maxItems });
const object = <T extends Record<string, unknown>>(properties: T) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const category = (task: TaskType) => task === 'general_task_1' ? { type: 'null' } : { type: 'string', enum: allowedCategories(task) };
export const inputSchema = object({
  task_type: { type: 'string', enum: TASK_TYPES },
  question_category: { anyOf: [{ type: 'string', enum: ['auto', ...allowedCategories('academic_task_1'), ...allowedCategories('academic_task_2')] }, { type: 'null' }] },
  question: text(12_000), essay: text(100_000),
  task_image: { anyOf: [{ type: 'null' }, object({ mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] }, data: text(Math.ceil(MAX_IMAGE_BYTES / 3) * 4) })] },
  rubric_version: { type: 'string', const: 'ielts_official_v1' },
});
export const analysisSchema = (task: TaskType) => object({
  question_category: category(task), classification_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  classification_notes: text(), task_requirements: { ...strings(), minItems: 1 }, potential_missing_context: strings(),
});
export const criterionSchema = object({
  band: { anyOf: [{ type: 'number', minimum: 0, maximum: 9, multipleOf: 0.5 }, { type: 'null' }] },
  reason: text(), evidence_quotes: strings(8), next_band_gap: text(),
});
export const examinerSchema = (task: TaskType) => object({
  status: { type: 'string', enum: ['scored', 'partial', 'needs_input', 'review_required'] },
  criteria: object(Object.fromEntries(criterionKeys(task).map(key => [key, criterionSchema]))), quality_flags: strings(),
});
export const auditSchema = (task: TaskType) => object({
  affects_result: { type: 'boolean' },
  flagged_criteria: { type: 'array', items: { type: 'string', enum: criterionKeys(task) }, maxItems: 4, uniqueItems: true },
  issues: strings(),
});
const ajv = new Ajv({ allErrors: true, strict: true });
export function schemaErrors(schema: object, value: unknown): string[] {
  const validate = ajv.compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`);
}
export class InputError extends Error {}
export function parseInput(value: unknown): ScoringInput {
  const issues = schemaErrors(inputSchema, value);
  if (issues.length) throw new InputError(`Dữ liệu chấm bài không hợp lệ: ${issues.join('; ')}`);
  const input = value as ScoringInput;
  if (!input.question.trim() || !input.essay.trim()) throw new InputError('Hãy nhập đầy đủ đề bài và bài viết.');
  if (!countHasWords(input.essay)) throw new InputError('Bài viết cần có nội dung bằng chữ để đánh giá.');
  if (input.task_type === 'general_task_1') {
    if (input.question_category !== null && input.question_category !== 'auto') throw new InputError('General Training Task 1 là dạng thư; không dùng nhãn biểu đồ.');
    input.question_category = null;
  } else if (input.question_category !== 'auto' && !allowedCategories(input.task_type).includes(input.question_category!)) {
    throw new InputError('Dạng đề không phù hợp với loại task đã chọn.');
  }
  if (input.task_image) {
    const { data, mime_type } = input.task_image;
    if (input.task_type !== 'academic_task_1') throw new InputError('Ảnh đề chỉ dùng cho Academic Task 1.');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new InputError('Ảnh đề không đúng định dạng base64.');
    const bytes = Buffer.from(data, 'base64');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !({ 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp }[mime_type])) throw new InputError('Ảnh đề phải là PNG, JPEG hoặc WebP hợp lệ, tối đa 2 MB.');
  }
  return input;
}
function countHasWords(text: string) { return /[\p{L}\p{N}]/u.test(text); }
