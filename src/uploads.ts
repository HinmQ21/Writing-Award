export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ACCEPT = '.txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const WORD_READ_ERROR = 'Chưa đọc được tệp Word. Hãy thử lại hoặc mở tệp trong Word, lưu thành .docx không đặt mật khẩu rồi chọn lại.';
const TOO_LONG = 'Nội dung vượt 100.000 ký tự. Hãy giữ lại phần bài viết cần nộp rồi chọn tệp lại.';

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Đã hủy đọc tệp.', 'AbortError');
}

function readWord(buffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./word.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException('Đã hủy đọc tệp.', 'AbortError')); };
    const timeout = setTimeout(() => {
      cleanup(); reject(new Error('Đọc tệp Word mất quá lâu. Hãy lưu lại một bản chỉ chứa bài viết rồi thử lại.'));
    }, 15_000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<{ text?: string; error?: string }>) => {
      cleanup();
      if (typeof event.data.text === 'string') resolve(event.data.text);
      else reject(new Error(event.data.error === 'too-long' ? TOO_LONG : WORD_READ_ERROR));
    };
    worker.onerror = event => { event.preventDefault(); cleanup(); reject(new Error(WORD_READ_ERROR)); };
    worker.postMessage(buffer, [buffer]);
  });
}

export async function readEssayFile(file: File, signal?: AbortSignal): Promise<string> {
  aborted(signal);
  if (/\.doc$/i.test(file.name)) throw new Error('Tệp .doc là định dạng Word cũ. Hãy mở trong Word, chọn Lưu dưới dạng → .docx rồi tải lại.');
  if (!/\.(txt|md|docx)$/i.test(file.name)) throw new Error('Hỗ trợ Word .docx, .txt hoặc .md. Với PDF, hãy sao chép nội dung rồi dán vào ô viết.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Tệp lớn hơn 5 MB. Hãy chọn tệp nhỏ hơn hoặc lưu một bản chỉ chứa bài viết.');
  const word = /\.docx$/i.test(file.name);
  const text = word ? await readWord(await file.arrayBuffer(), signal) : await file.text();
  aborted(signal);
  if (text.includes('\u0000')) throw new Error('Tệp chưa phải văn bản đọc được. Hãy lưu lại thành .docx hoặc TXT rồi thử lại.');
  if (text.length > 100_000) throw new Error(TOO_LONG);
  const value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!/[\p{L}\p{N}]/u.test(value)) throw new Error(word
    ? 'Tệp Word chưa có nội dung văn bản đọc được. Hãy chọn tệp có bài viết hoặc dán nội dung trực tiếp.'
    : 'Tệp chưa có nội dung bài viết. Hãy chọn tệp khác hoặc dán bài trực tiếp.');
  return value;
}
