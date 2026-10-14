import type { receiptExtractionSchema } from '../schemas/receiptExtractionSchema';
import type { ReceiptAssessment, ValidatedReceiptAnalysis } from './receiptExtraction';

export interface ReceiptResponsesRequest {
  model: string;
  store: false;
  stream: false;
  instructions: string;
  input: Array<{ role: 'user'; content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'high' }
    | { type: 'input_file'; filename: 'document.pdf'; file_data: string }
  > }>;
  text: { format: { type: 'json_schema'; name: 'receipt_extraction_v1'; strict: true; schema: typeof receiptExtractionSchema } };
  max_output_tokens: number;
}

export type ReceiptAnalysisOrigin = 'simulated' | 'real';

// O contrato representa a origem futura; não habilita transporte de rede.
// O adaptador e a rota continuam bloqueando real, sem retries ou fallback.
export interface ReceiptResponsesTransport {
  readonly mode: ReceiptAnalysisOrigin;
  create(request: ReceiptResponsesRequest, options: { signal: AbortSignal }): Promise<unknown>;
}

export type ReceiptAdapterStatus = 'success' | 'partial' | 'rejected' | 'inconclusive' | 'error' | 'cancelled';
type WithSimulation<T, IsSimulated extends boolean> = T extends unknown ? Omit<T, 'isSimulated'> & { isSimulated: IsSimulated } : never;

export interface ReceiptAdapterMetrics<IsSimulated extends boolean = boolean> {
  model: string;
  isSimulated: IsSimulated;
  status: ReceiptAdapterStatus;
  durationMs: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

interface ReceiptAdapterData<IsSimulated extends boolean> {
  status: ReceiptAdapterStatus;
  code?: string;
  analysis: WithSimulation<ValidatedReceiptAnalysis, IsSimulated>;
  assessment?: ReceiptAssessment;
  metrics: ReceiptAdapterMetrics<IsSimulated>;
}

// Origem interna: não acrescenta campos ao contrato HTTP nem ao JSON do modelo.
// Impede combinar origem simulada com análise/métricas reais, ou vice-versa.
export type ReceiptAdapterResult =
  | ({ readonly origin: 'simulated' } & ReceiptAdapterData<true>)
  | ({ readonly origin: 'real' } & ReceiptAdapterData<false>);
