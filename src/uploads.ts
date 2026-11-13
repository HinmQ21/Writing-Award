export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ACCEPT = '.txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const WORD_READ_ERROR = 'Couldn\'t read the Word file. Try again or open it in Word, save it as a .docx without a password, and select it again.';
const TOO_LONG = 'The content exceeds 100,000 characters. Please keep just the essay part you want to submit and select the file again.';

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('File reading cancelled.', 'AbortError');
}

function readWord(buffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./word.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException('File reading cancelled.', 'AbortError')); };
    const timeout = setTimeout(() => {
      cleanup(); reject(new Error('Reading the Word file is taking too long. Please save a copy containing just your essay and try again.'));
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
  if (/\.doc$/i.test(file.name)) throw new Error('.doc is an older Word format. Please open it in Word, go to Save As → .docx, and upload it again.');
  if (!/\.(txt|md|docx)$/i.test(file.name)) throw new Error('Supports Word .docx, .txt, or .md. For PDFs, simply copy the content and paste it into the writing box.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('The file is larger than 5 MB. Please choose a smaller file or save a copy containing only your essay.');
  const word = /\.docx$/i.test(file.name);
  const text = word ? await readWord(await file.arrayBuffer(), signal) : await file.text();
  aborted(signal);
  if (text.includes('\u0000')) throw new Error('This file isn\'t a readable text document. Please save it as a .docx or TXT and try again.');
  if (text.length > 100_000) throw new Error(TOO_LONG);
  const value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!/[\p{L}\p{N}]/u.test(value)) throw new Error(word
    ? 'The Word file doesn\'t contain readable text. Please choose a file with your essay or paste the content directly.'
    : 'The file doesn\'t have any essay content. Please pick another file or paste your essay directly.');
  return value;
}
