import type { ReceiptUpload } from './receiptMultipart';
import { ReceiptUploadError } from './receiptUploadError';

export interface ScopedReceiptDocument {
  readonly format: ReceiptUpload['format'];
  readonly mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  readonly size: number;
  // Empréstimo sem cópia: não reter, modificar, persistir ou repassar a tarefas soltas.
  // Todos os acessos pela API são revogados ao cancelar ou finalizar o consumidor.
  readBytes(): Buffer;
}

// A Promise deve abranger TODO o processamento e sua limpeza, inclusive após abort.
// Consumidores internos são confiáveis e devem cooperar com o sinal; não destacar
// tarefas que sobrevivam à Promise. Código não cooperativo exige processo isolado.
export type ReceiptDocumentConsumer = (document: ScopedReceiptDocument, signal: AbortSignal) => Promise<void>;

export async function withReceiptDocument(
  upload: ReceiptUpload,
  consume: ReceiptDocumentConsumer,
  signal: AbortSignal,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  let current: ReceiptUpload | undefined = upload;
  let active = true;
  const assertActive = () => {
    if (!active) throw new ReceiptUploadError(504, 'DOCUMENT_ACCESS_CLOSED');
  };
  const mimeTypes = { jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' } as const;
  const document: ScopedReceiptDocument = Object.freeze({
    get format() { assertActive(); return current!.format; },
    get mimeType() { assertActive(); return mimeTypes[current!.format]; },
    get size() { assertActive(); return current!.bytes.length; },
    readBytes() { assertActive(); return current!.bytes; }
  });
  const cancel = () => {
    active = false;
    controller.abort();
  };
  const timer = setTimeout(cancel, timeoutMs);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) cancel();
    if (controller.signal.aborted) throw new ReceiptUploadError(504, 'DOCUMENT_PROCESSING_CANCELLED_OR_TIMED_OUT');
    // Não usar Promise.race: a reserva permanece até o consumidor confirmar término.
    await consume(document, controller.signal);
    if (controller.signal.aborted) throw new ReceiptUploadError(504, 'DOCUMENT_PROCESSING_CANCELLED_OR_TIMED_OUT');
  } catch (error) {
    if (controller.signal.aborted) throw new ReceiptUploadError(504, 'DOCUMENT_PROCESSING_CANCELLED_OR_TIMED_OUT');
    throw error;
  } finally {
    active = false;
    current = undefined;
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    // O proprietário (middleware) zera os bytes após esta função assentar.
  }
}
