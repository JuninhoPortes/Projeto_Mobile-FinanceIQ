import type { ReceiptDocument, ReceiptMimeType, ReceiptSource } from '../types/receipt';

export const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;
export const RECEIPT_MIME_TYPES: ReceiptMimeType[] = [
  'image/jpeg', 'image/png', 'application/pdf'
];

interface DocumentMetadata {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number;
  source: ReceiptSource;
}

export function normalizeReceiptDocument(metadata: DocumentMetadata): ReceiptDocument {
  const extension = metadata.name.split('.').pop()?.toLowerCase();
  const extensionMime: Record<string, ReceiptMimeType> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf'
  };
  const nameMime = extension ? extensionMime[extension] : undefined;
  const providedMime = metadata.mimeType?.toLowerCase().split(';')[0].trim();
  const mime = !providedMime || providedMime === 'application/octet-stream'
    ? nameMime
    : providedMime;

  if (
    !metadata.uri || !nameMime || !mime ||
    !RECEIPT_MIME_TYPES.includes(mime as ReceiptMimeType) || mime !== nameMime ||
    (metadata.source === 'camera' && mime === 'application/pdf')
  ) {
    throw new Error('Formato não permitido. Escolha uma imagem JPG/JPEG, PNG ou um PDF.');
  }

  if (!Number.isFinite(metadata.size) || (metadata.size ?? 0) <= 0) {
    throw new Error('Não foi possível verificar o arquivo. Escolha outro documento.');
  }

  if (metadata.size! > MAX_RECEIPT_SIZE) {
    throw new Error('O arquivo excede o limite de 10 MB. Escolha um arquivo menor.');
  }

  return { ...metadata, mimeType: mime as ReceiptMimeType, size: metadata.size! };
}
