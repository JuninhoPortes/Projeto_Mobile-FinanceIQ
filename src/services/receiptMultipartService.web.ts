import type { ReceiptDocument } from '../types/receipt';
import { MAX_RECEIPT_SIZE } from './receiptDocumentService';

export async function createReceiptMultipart(document: ReceiptDocument, signal: AbortSignal): Promise<FormData> {
  if (signal.aborted) throw new Error('Upload cancelado');
  if (!document.uri.startsWith('blob:')) throw new Error('URI local inválida');
  // O seletor existente guarda o File em uma URL temporária local. Nunca enviar Bearer aqui.
  const response = await fetch(document.uri, { signal });
  if (!response.ok) throw new Error('Arquivo indisponível');
  const file = await response.blob();
  if (signal.aborted || file.size !== document.size || file.size <= 0 || file.size > MAX_RECEIPT_SIZE ||
    (file.type && file.type !== document.mimeType)) throw new Error('Arquivo inválido');
  const form = new FormData();
  form.append('document', file, document.name);
  return form;
}
