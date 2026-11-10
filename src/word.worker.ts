import { extractRawText } from 'mammoth';

// Only extract text. Word HTML, images and embedded links are never rendered.
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const result = await extractRawText({ arrayBuffer: event.data });
    if (result.value.length > 100_000) {
      self.postMessage({ error: 'too-long' });
    } else {
      self.postMessage({ text: result.value });
    }
  } catch {
    self.postMessage({ error: 'invalid' });
  }
};
