import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { ReceiptTokenVerifier } from '../types/receiptAuth';

const RECEIPTS_APP_NAME = 'financeiq-receipts';

// Inicialização preguiçosa: configuração ausente não derruba endpoints existentes.
// As funções do SDK são substituídas somente pelos testes; não existe modo sem verificação.
export function createFirebaseTokenVerifier(): ReceiptTokenVerifier {
  return async idToken => {
    // O emulador aceita tokens sem assinatura. Esta rota nunca permite esse atalho.
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined) {
      throw new Error('Firebase Auth emulator is not supported for this route.');
    }
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new Error('Firebase project is not configured.');

    const app = getApps().find(candidate => candidate.name === RECEIPTS_APP_NAME) ?? initializeApp({
      projectId,
      credential: applicationDefault()
    }, RECEIPTS_APP_NAME);
    if (app.options.projectId !== projectId) throw new Error('Firebase project configuration mismatch.');

    // true também verifica revogação e usuário desabilitado. Não usar custom tokens.
    const decoded = await getAuth(app).verifyIdToken(idToken, true);
    return { uid: decoded.uid };
  };
}
