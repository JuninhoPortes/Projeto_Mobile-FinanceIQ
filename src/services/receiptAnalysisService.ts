import { receiptMockConfig } from '../constants/receiptMockConfig';
import { createReceiptMockService } from './receiptMockService';
import type { ReceiptInterpretationService } from '../types/receipt';

const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

// Este é o ponto de substituição futuro por um serviço que use o backend.
// Continua sendo mock em produção; não há interpretação real nesta versão.
export const receiptAnalysisService: ReceiptInterpretationService = createReceiptMockService(
  isDevelopment ? receiptMockConfig : { scenario: 'success', delayMs: 1200 }
);
