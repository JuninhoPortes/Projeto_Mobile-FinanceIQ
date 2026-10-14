import type { RequestHandler } from 'express';
import type { ReceiptRouteError } from '../types/receiptAuth';
import type { ReceiptAdapterResult } from '../types/receiptOpenAI';

export const analyzeReceipt: RequestHandler = (_req, res) => {
  const result: ReceiptAdapterResult | undefined = res.locals.receiptAnalysisResult;
  delete res.locals.receiptAnalysisResult;
  // O controller só responde após descarte e liberação pelo middleware.
  if (result) {
    if (result.status === 'error' || result.status === 'cancelled') {
      const status = result.status === 'cancelled' || result.code === 'TIMEOUT' ? 504 : result.code === 'RATE_LIMIT' ? 429 : 503;
      res.status(status).json({ error: true, code: result.code ?? 'RECEIPT_ANALYSIS_UNAVAILABLE', message: result.analysis.message, isSimulated: true });
    } else {
      res.status(200).json({ ...result.analysis, message: `Dados demonstrativos, não extraídos do documento. ${result.analysis.message}`, documentStatus: result.status, assessment: result.assessment });
    }
    return;
  }
  res.status(501).json({
    error: true,
    code: 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED',
    message: 'A análise de notas fiscais ainda não foi implementada. Continue preenchendo manualmente.'
  } satisfies ReceiptRouteError);
};
