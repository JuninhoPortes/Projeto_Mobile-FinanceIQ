import { createServer } from 'node:http';
import { createApp } from './app';
import { createReceiptAnalysisMiddleware } from './middleware/receiptAnalysis';
import { createReceiptOpenAITransport, type ReceiptOpenAIClientFactory } from './services/receiptOpenAITransport';
import { receiptRealOpenAIConfig } from './services/receiptOpenAIAdapter';
import { createReceiptLocalAttempts } from './services/receiptLocalAttempts';
import { createReceiptPilotMetrics } from './services/receiptPilotMetrics';
import type { ReceiptTokenVerifier } from './types/receiptAuth';

export async function startReceiptLocal(values: NodeJS.ProcessEnv, directory: string, dependencies: {
  verifyToken?: ReceiptTokenVerifier;
  createOpenAIClient?: ReceiptOpenAIClientFactory;
  write?: (line: string) => void;
} = {}) {
  const env = {
    PORT: '3002', RECEIPT_REQUESTS_PER_MINUTE: '2', RECEIPT_REQUESTS_PER_DAY: '5',
    RECEIPT_OPENAI_TIMEOUT_MS: '25000', RECEIPT_PROCESSING_TIMEOUT_MS: '30000',
    RECEIPT_OPENAI_MAX_OUTPUT_TOKENS: '2048', ...values,
    NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_REAL_PROFILE: 'local-operational',
    RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_GLOBAL_CONCURRENCY: '1'
  };
  const uid = values.RECEIPT_LOCAL_UID?.trim();
  const integer = (text: string | undefined, min: number, max: number) => {
    const value = text && /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('LOCAL_LIMIT_CONFIGURATION');
    return value;
  };
  if (values.NODE_ENV === 'production' || values.FIREBASE_AUTH_EMULATOR_HOST !== undefined ||
    !uid || uid.length > 128 || /[\s,*]/.test(uid) || !values.FIREBASE_PROJECT_ID?.trim()) throw new Error('LOCAL_AUTH_CONFIGURATION');
  const port = integer(env.PORT, 0, 65535);
  integer(env.RECEIPT_REQUESTS_PER_MINUTE, 1, 5);
  const daily = integer(env.RECEIPT_REQUESTS_PER_DAY, 1, 10);
  const config = receiptRealOpenAIConfig(env); // Flags verdadeiras obrigatórias, sem orçamento declarativo.
  createReceiptOpenAITransport(env, dependencies.createOpenAIClient); // Configuração válida, ainda sem instanciar SDK/enviar.
  const consumeAttempt = await createReceiptLocalAttempts(directory, daily);
  const write = dependencies.write ?? (line => console.log(line));
  const app = createApp({
    verifyToken: dependencies.verifyToken, pilotUIDs: uid,
    corsOptions: { origin: ['http://localhost:8081', 'http://127.0.0.1:8081'], methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] },
    receiptAnalysis: createReceiptAnalysisMiddleware(env, {
      createOpenAIClient: dependencies.createOpenAIClient, beforeProviderSend: consumeAttempt,
      onMetrics: createReceiptPilotMetrics(config.model, write, 'receipt_local_metrics')
    })
  });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  return server;
}
