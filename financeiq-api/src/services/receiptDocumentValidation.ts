import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import type { ReceiptUpload } from './receiptMultipart';
import type { ReceiptUploadConfig } from './receiptUploadLimits';
import { ReceiptUploadError } from './receiptUploadError';

export function validateReceiptDocument(upload: ReceiptUpload, config: ReceiptUploadConfig, signal: AbortSignal, launch: typeof fork = fork): Promise<void> {
  return new Promise((accept, reject) => {
    // Não herdar ADC, tokens, variáveis de autenticação, NODE_OPTIONS ou caminhos de credenciais.
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
    let child: ReturnType<typeof fork>;
    try {
      child = launch(resolve(__dirname, '../../workers/receiptDocumentWorker.cjs'), [], {
        execArgv: ['--max-old-space-size=128'], env, silent: true, serialization: 'advanced'
      });
    } catch { reject(new ReceiptUploadError(503, 'DOCUMENT_VALIDATION_UNAVAILABLE')); return; }
    let failure: ReceiptUploadError | undefined;
    let replied = false;
    let done = false;
    // Nenhuma saída do parser é registrada. As saídas são apenas drenadas.
    child.stdout?.resume();
    child.stderr?.resume();
    const abort = () => {
      failure = new ReceiptUploadError(504, 'DOCUMENT_VALIDATION_TIMEOUT');
      child.kill('SIGKILL');
    };
    const timer = setTimeout(abort, config.validationTimeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    const finish = (exitCode: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (replied && exitCode === 0) accept();
      else reject(new ReceiptUploadError(503, 'DOCUMENT_VALIDATION_UNAVAILABLE'));
    };
    child.on('error', () => {
      failure = new ReceiptUploadError(503, 'DOCUMENT_VALIDATION_UNAVAILABLE');
      child.kill('SIGKILL');
    });
    child.once('close', finish); // Só liberar reserva após o processo ser encerrado.
    child.once('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'ok' in message && message.ok === true) replied = true;
      else {
        const safeCodes = new Set(['SIGNATURE_MISMATCH', 'INVALID_IMAGE', 'IMAGE_OUTSIDE_POLICY', 'INVALID_PDF', 'PROTECTED_PDF', 'PDF_PAGE_LIMIT', 'INVALID_DOCUMENT']);
        const code = message && typeof message === 'object' && 'code' in message && typeof message.code === 'string' && safeCodes.has(message.code) ? message.code : 'INVALID_DOCUMENT';
        failure = new ReceiptUploadError(code === 'SIGNATURE_MISMATCH' ? 415 : 422, code);
      }
    });
    if (signal.aborted) abort();
    else child.send({ bytes: upload.bytes, format: upload.format, config }, error => {
      if (error && !done) {
        failure = new ReceiptUploadError(503, 'DOCUMENT_VALIDATION_UNAVAILABLE');
        child.kill('SIGKILL');
      }
    });
  });
}
