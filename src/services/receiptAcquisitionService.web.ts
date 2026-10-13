import type { ReceiptAcquisitionResult, ReceiptDocument, ReceiptSource } from '../types/receipt';
import { normalizeReceiptDocument, RECEIPT_MIME_TYPES } from './receiptDocumentService';

// URLs locais criadas por este módulo; nenhum upload ou leitura em base64.
const documentUrls = new Set<string>();

export function releaseReceiptDocument(document: ReceiptDocument): void {
  if (documentUrls.delete(document.uri)) URL.revokeObjectURL(document.uri);
}

export function acquireReceiptDocument(
  source: ReceiptSource,
  signal: AbortSignal
): Promise<ReceiptAcquisitionResult> {
  if (signal.aborted) return Promise.resolve({ status: 'cancelled' });
  if (typeof document === 'undefined') {
    return Promise.resolve({ status: 'error', message: 'Seleção de arquivos indisponível neste navegador.' });
  }

  // Mantém o clique síncrono para respeitar a ativação exigida pelo navegador.
  // Adaptador próprio permite remover o input inclusive ao cancelar a operação.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (source === 'camera'
      ? RECEIPT_MIME_TYPES.filter(mime => mime.startsWith('image/'))
      : RECEIPT_MIME_TYPES).join(',');
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    let completed = false;

    const finish = (result: ReceiptAcquisitionResult) => {
      if (completed) return;
      completed = true;
      signal.removeEventListener('abort', cancel);
      input.removeEventListener('cancel', cancel);
      input.removeEventListener('change', select);
      input.remove();
      resolve(result);
    };
    const cancel = () => finish({ status: 'cancelled' });
    const select = () => {
      const file = input.files?.[0];
      if (!file || signal.aborted) return cancel();
      let uri: string | undefined;
      try {
        uri = URL.createObjectURL(file);
        const receipt = normalizeReceiptDocument({
          uri, name: file.name, mimeType: file.type, size: file.size, source
        });
        documentUrls.add(uri);
        finish({ status: 'selected', document: receipt });
      } catch (error) {
        if (uri) URL.revokeObjectURL(uri);
        finish({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível selecionar o arquivo.'
        });
      }
    };

    signal.addEventListener('abort', cancel, { once: true });
    input.addEventListener('cancel', cancel);
    input.addEventListener('change', select);
    try {
      input.click();
    } catch {
      finish({ status: 'error', message: 'Não foi possível abrir o seletor. Tente Escolher arquivo.' });
    }
  });
}
