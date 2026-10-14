import type { ReceiptExtraction, ReceiptValidationContext } from '../types/receiptExtraction';
import { ReceiptProviderFailure } from './receiptOpenAIAdapter';

export const receiptSimulationScenarios = ['success', 'partial', 'rejected', 'unreadable', 'error', 'timeout'] as const;
export type ReceiptSimulationScenario = typeof receiptSimulationScenarios[number];

// Fixture inteiramente demonstrativa. Nunca depende do conteúdo/nome do upload.
export function simulatedReceiptResponse(scenario: ReceiptSimulationScenario, context: ReceiptValidationContext): unknown {
  if (scenario === 'error') throw new ReceiptProviderFailure('UNAVAILABLE');
  if (scenario === 'timeout') throw new ReceiptProviderFailure('TIMEOUT');
  const category = context.categories.find(item => item.is_active && item.type === 'outcome');
  const extraction: ReceiptExtraction = {
    schemaVersion: '1',
    document: { classification: 'nfce', certainty: 'clear', readability: 'readable', multipleDocuments: false },
    fields: {
      merchant: { value: 'Estabelecimento fictício da simulação', certainty: 'clear' },
      description: { value: 'SIMULAÇÃO — compra demonstrativa', certainty: 'clear' },
      amount: { valueCents: 12990, currency: 'BRL', certainty: 'clear' },
      type: { value: 'outcome', certainty: 'clear' },
      category: { value: category?.name ?? null, certainty: category ? 'clear' : 'missing' },
      identifiedDate: { value: null, certainty: 'missing' }
    }
  };
  if (scenario === 'partial') {
    extraction.document.readability = 'partial';
    extraction.fields.amount = { valueCents: null, currency: null, certainty: 'missing' };
  } else if (scenario === 'rejected') extraction.document.classification = 'other';
  else if (scenario === 'unreadable') extraction.document.readability = 'unreadable';
  return {
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(extraction) }] }]
    // Sem usage inventado: métricas/custo ficam nulos na simulação HTTP.
  };
}

export async function waitForReceiptSimulation(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new ReceiptProviderFailure('TIMEOUT');
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new ReceiptProviderFailure('TIMEOUT')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delayMs);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
