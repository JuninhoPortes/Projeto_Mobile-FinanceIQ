import type { ReceiptDocument } from '../types/receipt';

export async function createReceiptMultipart(document: ReceiptDocument, signal: AbortSignal): Promise<FormData> {
  if (signal.aborted) throw new Error('Upload cancelado');
  if (!/^(file|content):\/\//.test(document.uri)) throw new Error('URI local inválida');
  // A extensão URI do FormData do React Native não consta na assinatura DOM do Expo.
  // Tipagem restrita ao adaptador nativo; o arquivo não é convertido em um Blob fictício.
  const form = new FormData() as FormData & {
    append(name: string, file: { uri: string; name: string; type: string }): void;
  };
  // React Native serializa este descritor e lê a URI nativa sem base64 ou cópia persistente.
  form.append('document', { uri: document.uri, name: document.name, type: document.mimeType });
  return form;
}
