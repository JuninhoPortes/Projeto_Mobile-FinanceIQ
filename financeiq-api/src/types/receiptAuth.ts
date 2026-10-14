export interface ReceiptIdentity {
  uid: string;
}

// Apenas o SDK verificador pode fornecer esta identidade em produção.
export type ReceiptTokenVerifier = (idToken: string) => Promise<ReceiptIdentity>;

export interface ReceiptRouteError {
  error: true;
  code: 'AUTH_REQUIRED' | 'RECEIPT_ACCESS_DENIED' | 'AUTH_UNAVAILABLE' | 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED';
  message: string;
}
