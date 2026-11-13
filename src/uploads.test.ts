import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, readEssayFile } from './uploads';

describe('essay file validation', () => {
  it('preserves Unicode paragraphs and normalizes line endings', async () => {
    const text = '\uFEFFFirst paragraph.\r\n\r\nMỗi ngày một chút.\rLast line.  ';
    expect(await readEssayFile(new File([text], 'essay.TXT'))).toBe('First paragraph.\n\nMỗi ngày một chút.\nLast line.');
  });
  it('retains Markdown text', async () => {
    expect(await readEssayFile(new File(['# My essay\n\nDaily practice.'], 'essay.md'))).toBe('# My essay\n\nDaily practice.');
  });
  it('gives a conversion path for legacy Word', async () => {
    await expect(readEssayFile(new File(['binary'], 'essay.doc'))).rejects.toThrow('Save As → .docx');
  });
  it('rejects unsupported formats', async () => {
    await expect(readEssayFile(new File(['%PDF'], 'essay.pdf'))).rejects.toThrow('Word .docx');
  });
  it('rejects oversize Word before starting the parser', async () => {
    await expect(readEssayFile(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'essay.docx'))).rejects.toThrow('5 MB');
  });
  it('rejects empty and binary text rather than replacing a draft', async () => {
    await expect(readEssayFile(new File(['  \n ...'], 'empty.txt'))).rejects.toThrow('have any essay content');
    await expect(readEssayFile(new File(['\0PK'], 'binary.txt'))).rejects.toThrow('readable text document');
  });
  it('limits the extracted text length independently of file size', async () => {
    await expect(readEssayFile(new File(['a'.repeat(100_001)], 'long.txt'))).rejects.toThrow('100,000');
  });
  it('does not read a cancelled import', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readEssayFile(new File(['...'], 'essay.docx'), controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  });
});
