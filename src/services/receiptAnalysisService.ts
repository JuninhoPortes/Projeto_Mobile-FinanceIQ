import { receiptMockConfig } from '../constants/receiptMockConfig';
import { createReceiptMockService } from './receiptMockService';
import type { ReceiptInterpretationService } from '../types/receipt';

const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

const configuredMode = typeof process === 'undefined'
  ? 'mock' : process.env.EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE ?? 'mock';

// Modo desconhecido ou backend solicitado em produção: bloquear, sem fallback.
export const receiptAnalysisMode = configuredMode === 'mock' ? 'mock'
  : configuredMode === 'backend-simulated' && isDevelopment ? 'backend-simulated' : 'unavailable';

export const receiptAnalysisService: ReceiptInterpretationService = receiptAnalysisMode === 'mock'
  ? createReceiptMockService(isDevelopment ? receiptMockConfig : { scenario: 'success', delayMs: 1200 })
  : {
    async analyze(document, context, signal) {
      if (receiptAnalysisMode === 'unavailable') return {
        provider: 'backend', isSimulated: true, status: 'error',
        message: 'Análise indisponível neste ambiente. Continue preenchendo manualmente.'
      };
      const { receiptBackendService } = await import('./receiptBackendService');
      return receiptBackendService.analyze(document, context, signal);
    }
  };
