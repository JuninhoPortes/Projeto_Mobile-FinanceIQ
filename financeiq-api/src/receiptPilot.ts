import { createServer } from 'node:http';
import { createApp } from './app';
import { createReceiptAnalysisMiddleware } from './middleware/receiptAnalysis';
import { createFirebaseTokenVerifier } from './services/firebaseAdminService';
import { receiptOpenAIConfig } from './services/receiptOpenAIAdapter';
import { createReceiptOpenAITransport, type ReceiptOpenAIClientFactory } from './services/receiptOpenAITransport';
import { createReceiptPilotLock } from './services/receiptPilotLock';
import { createReceiptPilotMetrics } from './services/receiptPilotMetrics';
import { receiptUploadConfig } from './services/receiptUploadLimits';
import type { ReceiptTokenVerifier } from './types/receiptAuth';

// Dependências injetáveis somente por código de testes, nunca por HTTP/ambiente.
export async function startReceiptPilot(env: NodeJS.ProcessEnv = process.env, dependencies: {
  verifyToken?: ReceiptTokenVerifier;
  createOpenAIClient?: ReceiptOpenAIClientFactory;
  write?: (line: string) => void;
} = {}) {
  const settings = { ...env };
  const mode = settings.RECEIPT_ANALYSIS_MODE ?? 'disabled';
  const portText = settings.PORT ?? '3000';
  const port = /^\d+$/.test(portText) ? Number(portText) : NaN;
  const uid = settings.RECEIPT_PILOT_UIDS?.trim();
  const limits = receiptUploadConfig(settings);
  if (settings.RECEIPT_REAL_PROFILE !== undefined || settings.RECEIPT_PILOT_HOST !== '127.0.0.1' || !Number.isSafeInteger(port) || port < 0 || port > 65535 ||
    settings.NODE_ENV !== 'development' || !limits.enabled ||
    settings.RECEIPT_REQUESTS_PER_MINUTE !== '1' || settings.RECEIPT_REQUESTS_PER_DAY !== '1' || settings.RECEIPT_GLOBAL_CONCURRENCY !== '1' ||
    !uid || uid.length > 128 || /[\s,*]/.test(uid) || !settings.FIREBASE_PROJECT_ID?.trim() || settings.FIREBASE_AUTH_EMULATOR_HOST !== undefined ||
    !['disabled', 'simulated', 'real'].includes(mode) || (mode !== 'real' && (settings.RECEIPT_OPENAI_REAL_CALLS_ENABLED ?? 'false') !== 'false')) {
    throw new Error('Configuração do piloto indisponível.');
  }
  const config = receiptOpenAIConfig(settings);
  if (mode === 'real') createReceiptOpenAITransport(settings, dependencies.createOpenAIClient); // Valida sem criar cliente/enviar.
  const lock = mode === 'real' ? await createReceiptPilotLock(settings.RECEIPT_OPENAI_PILOT_LOCK_DIR) : undefined;
  const write = dependencies.write ?? (line => console.log(line));
  const app = createApp({
    verifyToken: dependencies.verifyToken ?? createFirebaseTokenVerifier(),
    pilotUIDs: uid,
    receiptAnalysis: createReceiptAnalysisMiddleware(settings, {
      createOpenAIClient: dependencies.createOpenAIClient,
      onMetrics: createReceiptPilotMetrics(config.model, write),
      beforeProviderSend: lock?.consume
    })
  });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Literal intencional: a configuração não pode ampliar a interface de rede.
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  return server;
}
