// Contrato de extração v1. Não representa uma transação nem comprova autenticidade fiscal.
export const receiptClassifications = ['nfe', 'nfce', 'nfse', 'fiscal_receipt', 'other', 'unknown'] as const;
export const receiptCertainties = ['clear', 'inferred', 'uncertain', 'missing'] as const;
export const receiptReadabilities = ['readable', 'partial', 'unreadable'] as const;

export type ReceiptCertainty = typeof receiptCertainties[number];
export type ReceiptClassification = typeof receiptClassifications[number];
export type ReceiptFieldName = 'merchant' | 'description' | 'amount' | 'type' | 'category' | 'identifiedDate';

export interface ExtractedReceiptField<T> {
  value: T | null;
  certainty: ReceiptCertainty;
}

export interface ReceiptExtraction {
  schemaVersion: '1';
  document: {
    classification: ReceiptClassification;
    certainty: ReceiptCertainty;
    readability: typeof receiptReadabilities[number];
    multipleDocuments: boolean;
  };
  fields: {
    merchant: ExtractedReceiptField<string>;
    description: ExtractedReceiptField<string>;
    amount: {
      valueCents: number | null;
      currency: string | null;
      certainty: ReceiptCertainty;
    };
    type: ExtractedReceiptField<'income' | 'outcome'>;
    // Nome sugerido: deve ser resolvido para uma categoria existente no contexto.
    category: ExtractedReceiptField<string>;
    identifiedDate: ExtractedReceiptField<string>;
  };
}

export interface ReceiptValidationContext {
  // Na futura rota, esta lista deverá ser obtida pelo servidor para o UID autenticado.
  categories: ReadonlyArray<{ name: string; type: 'income' | 'outcome'; is_active: boolean }>;
  maxAmountCents?: number;
}

// Subconjunto compatível com ReceiptRecognizedFields; não inclui data de lançamento.
export interface ValidatedReceiptFields {
  description?: string;
  amount?: number;
  type?: 'income' | 'outcome';
  category?: string;
  identifiedDate?: string;
}

export interface ReceiptAssessment {
  acceptance: 'accepted' | 'rejected' | 'undetermined';
  reasonCodes: string[];
  missingFields: ReceiptFieldName[];
  uncertainFields: ReceiptFieldName[];
  fields: ValidatedReceiptFields;
}

// Envelope produzido pelo servidor, nunca pelo modelo. Compatível com o mock atual.
interface BackendAnalysisMetadata {
  provider: 'backend';
  isSimulated: false;
  message: string;
}

export type ValidatedReceiptAnalysis = BackendAnalysisMetadata & (
  | { status: 'success'; fields: Required<Pick<ValidatedReceiptFields, 'description' | 'amount' | 'type' | 'category'>> & Pick<ValidatedReceiptFields, 'identifiedDate'> }
  | { status: 'partial'; fields: ValidatedReceiptFields }
  | { status: 'error' }
);
