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

// Não existe transporte de rede nesta etapa. Um transporte futuro precisará de
// aprovação e deverá implementar este método, respeitando signal e sem retries.
export interface ReceiptResponsesTransport {
  mode: 'simulated';
  create(request: ReceiptResponsesRequest, options: { signal: AbortSignal }): Promise<unknown>;
}

export type ReceiptAdapterStatus = 'success' | 'partial' | 'rejected' | 'inconclusive' | 'error' | 'cancelled';
type Simulated<T> = T extends unknown ? Omit<T, 'isSimulated'> & { isSimulated: true } : never;

export interface ReceiptAdapterMetrics {
  model: string;
  isSimulated: true;
  status: ReceiptAdapterStatus;
  durationMs: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface ReceiptAdapterResult {
  status: ReceiptAdapterStatus;
  code?: string;
  analysis: Simulated<ValidatedReceiptAnalysis>;
  assessment?: ReceiptAssessment;
  metrics: ReceiptAdapterMetrics;
}
