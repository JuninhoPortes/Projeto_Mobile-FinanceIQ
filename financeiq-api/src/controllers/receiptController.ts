import type { RequestHandler } from 'express';
import type { ReceiptRouteError } from '../types/receiptAuth';

export const analyzeReceipt: RequestHandler = (_req, res) => {
  // Etapa 2: nenhum arquivo é lido e nenhum interpretador é chamado.
  res.status(501).json({
    error: true,
    code: 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED',
    message: 'A análise de notas fiscais ainda não foi implementada. Continue preenchendo manualmente.'
  } satisfies ReceiptRouteError);
};
