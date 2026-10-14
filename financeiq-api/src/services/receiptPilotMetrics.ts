import type { ReceiptAdapterMetrics } from '../types/receiptOpenAI';
import type { receiptOpenAIConfig } from './receiptOpenAIAdapter';

const statuses = new Set(['success', 'partial', 'rejected', 'inconclusive', 'error', 'cancelled']);
const count = (value: number | null) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function createReceiptPilotMetrics(model: ReturnType<typeof receiptOpenAIConfig>['model'], write: (line: string) => void, event: 'receipt_pilot_metrics' | 'receipt_local_metrics' = 'receipt_pilot_metrics') {
  return (metrics: ReceiptAdapterMetrics) => {
    const inputTokens = count(metrics.inputTokens);
    const outputTokens = count(metrics.outputTokens);
    const cachedInputTokens = count(metrics.cachedInputTokens);
    const known = inputTokens !== null && outputTokens !== null && cachedInputTokens !== null && cachedInputTokens <= inputTokens &&
      typeof metrics.estimatedCostUsd === 'number' && Number.isFinite(metrics.estimatedCostUsd) && metrics.estimatedCostUsd >= 0;
    // Lista explícita; nunca espalhar metrics, erros, request ou resposta bruta.
    write(JSON.stringify({
      event, model,
      isSimulated: metrics.isSimulated === true,
      status: statuses.has(metrics.status) ? metrics.status : 'error',
      durationMs: count(metrics.durationMs), inputTokens, outputTokens, cachedInputTokens,
      estimatedCostUsd: known ? metrics.estimatedCostUsd : null,
      costStatus: known ? 'estimated' : 'unknown'
    }));
  };
}
