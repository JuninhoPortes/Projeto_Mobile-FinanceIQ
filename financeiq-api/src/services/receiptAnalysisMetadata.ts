import type { ReceiptAnalysisOrigin } from '../types/receiptOpenAI';

// Recebe exclusivamente configuração interna do servidor, nunca conteúdo HTTP
// ou metadados do provedor. Representar real não autoriza seu processamento.
export function receiptAnalysisMetadata(origin: ReceiptAnalysisOrigin) {
  if (origin === 'simulated') return Object.freeze({ origin, isSimulated: true as const });
  if (origin === 'real') return Object.freeze({ origin, isSimulated: false as const });
  throw new Error('Invalid receipt analysis origin');
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// Confere apenas a proveniência interna; não substitui a validação fiscal.
export function hasConsistentReceiptAnalysisMetadata(value: unknown): boolean {
  if (!object(value) || !object(value.analysis) || !object(value.metrics)) return false;
  if (value.origin !== 'simulated' && value.origin !== 'real') return false;
  const { isSimulated } = receiptAnalysisMetadata(value.origin);
  return value.analysis.provider === 'backend' && value.analysis.isSimulated === isSimulated &&
    value.metrics.isSimulated === isSimulated;
}
