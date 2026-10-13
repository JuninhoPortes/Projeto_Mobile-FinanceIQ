import type { ReceiptMockOptions } from '../types/receipt';

// Controle exclusivo de desenvolvimento: success, partial ou error.
// A fachada ignora esta configuração em produção e mantém o mock de sucesso.
export const receiptMockConfig: Readonly<ReceiptMockOptions> = {
  scenario: 'success',
  delayMs: 1200
};
