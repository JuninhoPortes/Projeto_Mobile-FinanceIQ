import OpenAI from 'openai';
import { receiptRealOpenAIConfig, ReceiptProviderFailure } from './receiptOpenAIAdapter';
import type { ReceiptResponsesRequest, ReceiptResponsesTransport } from '../types/receiptOpenAI';

interface ReceiptOpenAIRequestOptions {
  signal: AbortSignal;
  timeout: number;
  maxRetries: 0;
}

export interface ReceiptOpenAIClient {
  responses: { create(request: ReceiptResponsesRequest, options: ReceiptOpenAIRequestOptions): PromiseLike<unknown> };
}

interface ReceiptOpenAIClientOptions {
  apiKey: string;
  timeout: number;
  maxRetries: 0;
  baseURL: string;
  organization: null;
  project: null;
  adminAPIKey: null;
  webhookSecret: null;
  logLevel: 'off';
}

// Injeção exclusiva por código nos testes; nunca selecionada por HTTP/ambiente.
export type ReceiptOpenAIClientFactory = (options: ReceiptOpenAIClientOptions) => ReceiptOpenAIClient;
const sdkClient: ReceiptOpenAIClientFactory = options => new OpenAI(options);
const cancelled = () => Object.assign(new Error('Receipt analysis cancelled'), { name: 'AbortError' });

export function createReceiptOpenAITransport(env: NodeJS.ProcessEnv, createClient: ReceiptOpenAIClientFactory = sdkClient, beforeSend?: () => Promise<void>) {
  const config = receiptRealOpenAIConfig(env);
  // Só ler a chave depois das habilitações explícitas; nunca usar defaults do SDK.
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim() || /\s/.test(apiKey)) throw new ReceiptProviderFailure('INVALID_CONFIGURATION');
  const active = new Set<Promise<void>>();
  let client: ReceiptOpenAIClient | undefined;
  const transport: ReceiptResponsesTransport & { whenIdle(): Promise<void> } = {
    mode: 'real',
    create(request, { signal }) {
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
      const task = Promise.resolve().then(async () => {
        try {
          if (controller.signal.aborted) throw cancelled();
          // O piloto consome a autorização persistente antes de qualquer envio.
          // Erro, timeout ou cancelamento após este ponto nunca desfazem a trava.
          await beforeSend?.();
          if (controller.signal.aborted) throw cancelled();
          client ??= createClient({
            apiKey, maxRetries: 0, timeout: config.timeoutMs,
            // Impedir OPENAI_BASE_URL/PROJECT_ID/ORG_ID ambientais de alterar o destino.
            baseURL: 'https://api.openai.com/v1', organization: null, project: null,
            adminAPIKey: null, webhookSecret: null, logLevel: 'off'
          });
          const raw = await client.responses.create(request, { signal: controller.signal, maxRetries: 0, timeout: config.timeoutMs });
          if (timedOut) throw new ReceiptProviderFailure('TIMEOUT');
          if (controller.signal.aborted) throw cancelled();
          return raw;
        } catch (error) {
          if (timedOut) throw new ReceiptProviderFailure('TIMEOUT');
          if (controller.signal.aborted) throw cancelled();
          // Normalização e validação ficam no adaptador; nada é registrado aqui.
          throw error;
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        }
      });
      const settled = task.then(() => {}, () => {});
      active.add(settled);
      void settled.then(() => { active.delete(settled); });
      return task;
    },
    async whenIdle() {
      // Sem Promise.race: abort precisa terminar a operação local, não destacá-la.
      while (active.size) await Promise.all([...active]);
    }
  };
  return transport;
}
