import type { RequestHandler } from 'express';
import { createReceiptUpload } from './receiptUpload';
import { createReceiptOpenAIAdapter, receiptRealOpenAIConfig } from '../services/receiptOpenAIAdapter';
import { createReceiptOpenAITransport, type ReceiptOpenAIClientFactory } from '../services/receiptOpenAITransport';
import { createSimulatedReceiptTransport } from '../services/receiptSimulatedTransport';
import { receiptSimulationScenarios, simulatedReceiptResponse, waitForReceiptSimulation, type ReceiptSimulationScenario } from '../services/receiptSimulation';
import { validateReceiptDocument } from '../services/receiptDocumentValidation';
import type { ReceiptValidationContext } from '../types/receiptExtraction';
import type { ReceiptAdapterResult, ReceiptAdapterMetrics } from '../types/receiptOpenAI';

export function createReceiptAnalysisMiddleware(env = process.env, dependencies: {
  createOpenAIClient?: ReceiptOpenAIClientFactory;
  onMetrics?: (metrics: ReceiptAdapterMetrics) => void;
  beforeProviderSend?: () => Promise<void>;
} = {}): RequestHandler {
  const mode = env.RECEIPT_ANALYSIS_MODE ?? 'disabled';
  if (mode === 'disabled') return createReceiptUpload(env);
  const unavailable: RequestHandler = (_req, res) => {
    res.status(503).json({ error: true, code: 'RECEIPT_ANALYSIS_UNAVAILABLE', message: 'Modo de análise indisponível neste ambiente.' });
  };
  let realEnv: NodeJS.ProcessEnv | undefined;
  if (mode === 'real') {
    try {
      receiptRealOpenAIConfig(env);
      // Capturar somente configuração documental e a chave específica do provedor.
      realEnv = Object.fromEntries(Object.keys(env).filter(key => key === 'NODE_ENV' || key.startsWith('RECEIPT_')).map(key => [key, env[key]]));
      realEnv.OPENAI_API_KEY = env.OPENAI_API_KEY;
      createReceiptOpenAITransport(realEnv, dependencies.createOpenAIClient);
    } catch { return unavailable; }
  }
  const scenario = env.RECEIPT_SIMULATION_SCENARIO ?? 'success';
  const delayText = env.RECEIPT_SIMULATION_DELAY_MS ?? '250';
  const delayMs = /^\d+$/.test(delayText) ? Number(delayText) : NaN;
  if (mode !== 'real' && (mode !== 'simulated' || env.NODE_ENV !== 'development' || !receiptSimulationScenarios.includes(scenario as ReceiptSimulationScenario) || !Number.isSafeInteger(delayMs) || delayMs > 5000)) {
    return unavailable;
  }
  // Sem uma fonte de categorias autorizada por UID, não presumir categorias.
  // O formulário poderá preservar a categoria atual e exigir revisão manual.
  const context: ReceiptValidationContext = { categories: [] };
  const settings = realEnv ?? env;
  return createReceiptUpload(settings, validateReceiptDocument, undefined, res => async (document, signal) => {
    // Transporte/adaptador/resultados pertencem exclusivamente a esta requisição.
    const transport = mode === 'real' ? createReceiptOpenAITransport(settings, dependencies.createOpenAIClient, dependencies.beforeProviderSend) : createSimulatedReceiptTransport(async (_request, options) => {
      await waitForReceiptSimulation(delayMs, options.signal);
      return simulatedReceiptResponse(scenario as ReceiptSimulationScenario, context);
    });
    const adapter = createReceiptOpenAIAdapter(transport, { env: settings, origin: mode, onMetrics: dependencies.onMetrics });
    let result: ReceiptAdapterResult;
    try {
      result = await adapter.analyze({ bytes: document.readBytes(), format: document.format }, context, signal);
    } finally {
      // Retornar do adaptador após timeout não basta; confirmar o transporte ocioso.
      await transport.whenIdle();
    }
    if (!signal.aborted) res.locals.receiptAnalysisResult = result;
  });
}
