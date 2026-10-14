import Busboy, { type BusboyInstance } from '@fastify/busboy';
import type { Request } from 'express';
import { ReceiptUploadError } from './receiptUploadError';

export interface ReceiptUpload { bytes: Buffer; format: 'jpeg' | 'png' | 'pdf' }

export async function receiveReceipt(req: Request, maxBytes: number, signal: AbortSignal): Promise<ReceiptUpload> {
  const contentType = req.headers['content-type'];
  if (!contentType || contentType.length > 200 || !/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ReceiptUploadError(400, 'INVALID_MULTIPART');
  }
  // Limite do envelope além do conteúdo; também conferido durante streaming chunked.
  const envelopeLimit = maxBytes + 8192;
  if (Number(req.headers['content-length']) > envelopeLimit) throw new ReceiptUploadError(413, 'FILE_TOO_LARGE');
  let parser: BusboyInstance;
  try {
    parser = new Busboy({ headers: { ...req.headers, 'content-type': contentType }, limits: {
      fileSize: maxBytes + 1, files: 1, fields: 0, parts: 2, fieldSize: 0,
      fieldNameSize: 32, headerPairs: 8, headerSize: 2048
    } });
  } catch { throw new ReceiptUploadError(400, 'INVALID_MULTIPART'); }

  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = [];
    let length = 0;
    let envelope = 0;
    let selected: ReceiptUpload['format'] | undefined;
    let settled = false;
    let headerProbe = Buffer.alloc(0);
    let headerChecked = false;
    const cleanup = () => {
      req.unpipe(parser);
      req.off('data', countBytes);
      req.off('aborted', cancel);
      req.off('error', cancel);
      signal.removeEventListener('abort', cancel);
      headerProbe.fill(0);
      headerProbe = Buffer.alloc(0);
      parser.destroy();
    };
    const fail = (error: ReceiptUploadError) => {
      if (settled) return;
      settled = true;
      chunks.forEach(chunk => chunk.fill(0));
      chunks = [];
      cleanup();
      reject(error);
    };
    const cancel = () => fail(new ReceiptUploadError(504, 'UPLOAD_CANCELLED_OR_TIMED_OUT'));
    const countBytes = (chunk: Buffer) => {
      envelope += chunk.length;
      if (envelope > envelopeLimit) { fail(new ReceiptUploadError(413, 'FILE_TOO_LARGE')); return; }
      if (!headerChecked) {
        const previous = headerProbe;
        headerProbe = Buffer.concat([previous, chunk.subarray(0, Math.max(0, 2052 - previous.length))]);
        previous.fill(0);
        const end = headerProbe.indexOf('\r\n\r\n');
        if (end === -1 && headerProbe.length >= 2052) fail(new ReceiptUploadError(400, 'MULTIPART_HEADERS_LIMIT'));
        else if (end !== -1) {
          const lines = headerProbe.subarray(0, end).toString('latin1').split('\r\n');
          if (end > 2048 || lines.length > 9 || !lines[0].startsWith('--')) fail(new ReceiptUploadError(400, 'MULTIPART_HEADERS_LIMIT'));
          headerChecked = true;
          headerProbe.fill(0);
          headerProbe = Buffer.alloc(0);
        }
      }
    };
    parser.on('file', (name, stream, filename, _encoding, mime) => {
      stream.on('error', () => fail(new ReceiptUploadError(400, 'INVALID_MULTIPART')));
      if (name !== 'document' || selected || !filename || filename.length > 200) {
        stream.resume();
        fail(new ReceiptUploadError(400, 'UNEXPECTED_FILE'));
        return;
      }
      const extension = filename.split('.').pop()?.toLowerCase();
      const formats: Record<string, ReceiptUpload['format']> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', pdf: 'pdf' };
      const expected = extension ? formats[extension] : undefined;
      const expectedMime = expected === 'pdf' ? 'application/pdf' : `image/${expected}`;
      if (!expected || mime !== expectedMime) {
        stream.resume();
        fail(new ReceiptUploadError(415, 'UNSUPPORTED_DOCUMENT_FORMAT'));
        return;
      }
      selected = expected;
      stream.on('limit', () => fail(new ReceiptUploadError(413, 'FILE_TOO_LARGE')));
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        length += chunk.length;
        if (length > maxBytes) { fail(new ReceiptUploadError(413, 'FILE_TOO_LARGE')); return; }
        chunks.push(Buffer.from(chunk));
      });
    });
    parser.on('filesLimit', () => fail(new ReceiptUploadError(400, 'TOO_MANY_FILES')));
    parser.on('fieldsLimit', () => fail(new ReceiptUploadError(400, 'UNEXPECTED_FIELD')));
    parser.on('partsLimit', () => fail(new ReceiptUploadError(400, 'TOO_MANY_PARTS')));
    parser.on('error', () => fail(new ReceiptUploadError(400, 'INVALID_MULTIPART')));
    parser.on('finish', () => {
      if (settled) return;
      if (!selected) { fail(new ReceiptUploadError(400, 'DOCUMENT_REQUIRED')); return; }
      if (!length) { fail(new ReceiptUploadError(422, 'EMPTY_DOCUMENT')); return; }
      const bytes = Buffer.concat(chunks, length);
      chunks.forEach(chunk => chunk.fill(0));
      chunks = [];
      settled = true;
      cleanup();
      resolve({ bytes, format: selected });
    });
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    req.on('aborted', cancel);
    req.on('error', cancel);
    req.on('data', countBytes);
    req.pipe(parser);
  });
}
