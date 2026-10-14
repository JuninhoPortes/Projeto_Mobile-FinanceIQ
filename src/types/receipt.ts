export type ReceiptSource = 'camera' | 'file';

export type ReceiptMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

// Referência temporária; nunca enviada à persistência de lançamentos.
export interface ReceiptDocument {
  uri: string;
  name: string;
  mimeType: ReceiptMimeType;
  size: number;
  source: ReceiptSource;
}

export type ReceiptAcquisitionResult =
  | { status: 'selected'; document: ReceiptDocument }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };
import type { Category } from '../database/categoryService';
import type { Transaction } from '../database/transactionService';


export type ReceiptMockScenario = 'success' | 'partial' | 'error';

export interface ReceiptMockOptions {
  scenario: ReceiptMockScenario;
  delayMs: number;
}

export interface ReceiptAnalysisContext {
  categories: ReadonlyArray<Pick<Category, 'name' | 'type' | 'is_active'>>;
}

export interface ReceiptRecognizedFields {
  description?: string;
  amount?: number;
  type?: Transaction['type'];
  category?: string;
  // Apenas informação da análise: nunca define date ou period_month do lançamento.
  identifiedDate?: string;
}

export type ReceiptCompleteFields = Required<
  Pick<ReceiptRecognizedFields, 'description' | 'amount' | 'type' | 'category'>
> & Pick<ReceiptRecognizedFields, 'identifiedDate'>;

interface ReceiptAnalysisMetadata {
  provider: 'mock' | 'backend';
  isSimulated: boolean;
  message: string;
  documentStatus?: 'success' | 'partial' | 'rejected' | 'inconclusive';
}

export type ReceiptAnalysisResult = ReceiptAnalysisMetadata & (
  | { status: 'success'; fields: ReceiptCompleteFields }
  | { status: 'partial'; fields: ReceiptRecognizedFields }
  | { status: 'error' }
  | { status: 'cancelled' }
);

// Contrato compartilhado pelo mock local e pelas análises do backend.
export interface ReceiptInterpretationService {
  analyze(
    document: ReceiptDocument,
    context: ReceiptAnalysisContext,
    signal?: AbortSignal
  ): Promise<ReceiptAnalysisResult>;
}
