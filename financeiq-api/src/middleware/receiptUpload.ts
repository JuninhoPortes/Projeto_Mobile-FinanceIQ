import type { RequestHandler } from 'express';
import { receiptUploadConfig, LocalReceiptLimits, type ReceiptUploadConfig } from '../services/receiptUploadLimits';
import { receiveReceipt, type ReceiptUpload } from '../services/receiptMultipart';
import { validateReceiptDocument } from '../services/receiptDocumentValidation';
import { ReceiptUploadError } from '../services/receiptUploadError';
import { withReceiptDocument, type ReceiptDocumentConsumer } from '../services/receiptDocumentScope';

const messages: Record<number, string> = {
  400: 'Envie somente um arquivo no campo document usando multipart/form-data.',
  413: 'O arquivo excede o limite permitido.',
  415: 'Envie uma imagem JPG/JPEG, PNG ou um PDF com formato e conteúdo correspondentes.',
  422: 'Documento vazio, inválido, protegido ou fora dos limites permitidos.',
  429: 'Limite de uso ou de operações simultâneas atingido. Tente novamente mais tarde.',
  503: 'Recebimento de documentos temporariamente indisponível.',
  504: 'O prazo de envio ou validação do documento foi excedido.'
};

// Injeção apenas por código para testes; não exposta no corpo ou no ambiente.
export function createReceiptUpload(env = process.env, validate = validateReceiptDocument, consume?: ReceiptDocumentConsumer): RequestHandler {
  let config: ReceiptUploadConfig | undefined;
  try { config = receiptUploadConfig(env); } catch { /* Configuração inválida falha fechada. */ }
  const limits = config ? new LocalReceiptLimits(config) : undefined;
  return async (req, res, next) => {
    const refuse = (status: number, code: string) => {
      res.set('Connection', 'close');
      res.once('finish', () => req.destroy());
      res.status(status).json({ error: true, code, message: messages[status] });
    };
    if (!config?.enabled || !limits) {
      refuse(503, 'UPLOAD_CONTROLS_UNAVAILABLE');
      return;
    }
    const uid = res.locals.receiptIdentity?.uid;
    if (typeof uid !== 'string') {
      refuse(503, 'UPLOAD_CONTROLS_UNAVAILABLE');
      return;
    }
    const reservation = limits.acquire(uid);
    if (!reservation) {
      res.set('Retry-After', '60');
      refuse(429, 'RECEIPT_USAGE_LIMIT');
      return;
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timer = setTimeout(cancel, config.uploadTimeoutMs);
    req.once('aborted', cancel);
    res.once('close', cancel);
    let upload: ReceiptUpload | undefined;
    let failure: unknown;
    let failed = false;
    try {
      upload = await receiveReceipt(req, config.maxFileBytes, controller.signal);
      clearTimeout(timer);
      await validate(upload, config, controller.signal);
      // Só disponibilizar bytes após a validação real concluir e dentro da reserva.
      if (consume) await withReceiptDocument(upload, consume, controller.signal, config.processingTimeoutMs);
    } catch (error) { failed = true; failure = error; }
    finally {
      clearTimeout(timer);
      req.off('aborted', cancel);
      res.off('close', cancel);
      upload?.bytes.fill(0);
      upload = undefined;
      reservation.release();
    }
    if (req.aborted || res.destroyed) return;
    if (failed) {
      const error = failure instanceof ReceiptUploadError ? failure : new ReceiptUploadError(503, 'UPLOAD_UNAVAILABLE');
      // Não drenar um corpo rejeitado ilimitadamente: fechar a conexão após a resposta.
      refuse(error.status, error.code);
      return;
    }
    next();
  };
}
