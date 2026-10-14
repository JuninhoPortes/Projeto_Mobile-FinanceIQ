import { receiptExtractionSchema } from '../schemas/receiptExtractionSchema';
import { isReceiptExtraction, validateReceiptExtraction } from './receiptExtractionValidation';
import { receiptFiscalInstructions, receiptCategoryContext } from './receiptFiscalPrompt';
import { receiptAnalysisMetadata } from './receiptAnalysisMetadata';
import type { ReceiptUpload } from './receiptMultipart';
import type { ReceiptValidationContext } from '../types/receiptExtraction';
import type { ReceiptResponsesRequest, ReceiptResponsesTransport, ReceiptAdapterResult, ReceiptAdapterMetrics, ReceiptAnalysisOrigin } from '../types/receiptOpenAI';

type ReceiptAdapterOutcome = Omit<ReceiptAdapterResult, 'origin' | 'metrics'>;

const profiles = {
  'gpt-5.4-mini': [0.75, 0.075, 4.5],
  'gpt-5.4-mini-2026-03-17': [0.75, 0.075, 4.5],
  'gpt-4.1-mini': [0.4, 0.1, 1.6]
} as const;

export function receiptOpenAIConfig(env: NodeJS.ProcessEnv = {}) {
  const model = env.RECEIPT_OPENAI_MODEL ?? 'gpt-5.4-mini-2026-03-17';
  const integer = (key: string, fallback: number, max: number) => {
    const raw = env[key];
    const value = raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new ReceiptProviderFailure('INVALID_CONFIGURATION');
    return value;
  };
  if (!Object.prototype.hasOwnProperty.call(profiles, model)) throw new ReceiptProviderFailure('INVALID_CONFIGURATION');
  return {
    model: model as keyof typeof profiles,
    timeoutMs: integer('RECEIPT_OPENAI_TIMEOUT_MS', 15000, 45000),
    maxOutputTokens: integer('RECEIPT_OPENAI_MAX_OUTPUT_TOKENS', 2048, 4096)
  };
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export class ReceiptProviderFailure extends Error {
  constructor(public readonly code: 'TIMEOUT' | 'PROVIDER_AUTH' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'INVALID_REQUEST' | 'INVALID_CONFIGURATION') {
    super('Falha na interpretação do documento.');
  }
}

function failureCode(error: unknown): string {
  if (error instanceof ReceiptProviderFailure) return error.code;
  if (!object(error)) return 'UNAVAILABLE';
  if (error.status === 401 || error.status === 403) return 'PROVIDER_AUTH';
  if (error.code === 'invalid_api_key' || error.code === 'authentication_error') return 'PROVIDER_AUTH';
  if (error.status === 429 || error.code === 'rate_limit_exceeded' || error.code === 'insufficient_quota') return 'RATE_LIMIT';
  if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError' || error.name === 'APIConnectionTimeoutError') return 'TIMEOUT';
  if (error.status === 400) return 'INVALID_REQUEST';
  return 'UNAVAILABLE';
}

function measureUsage(raw: unknown, metrics: ReceiptAdapterMetrics, model: keyof typeof profiles) {
  if (!object(raw) || !object(raw.usage)) return;
  const usage = raw.usage;
  const cached = object(usage.input_tokens_details) ? usage.input_tokens_details.cached_tokens : undefined;
  if (!tokenCount(usage.input_tokens) || !tokenCount(usage.output_tokens) ||
    (cached !== undefined && (!tokenCount(cached) || cached > usage.input_tokens))) return;
  const cachedTokens = cached ?? 0;
  const [inputPrice, cachePrice, outputPrice] = profiles[model];
  metrics.inputTokens = usage.input_tokens;
  metrics.outputTokens = usage.output_tokens;
  metrics.cachedInputTokens = cachedTokens;
  metrics.estimatedCostUsd = ((usage.input_tokens - cachedTokens) * inputPrice + cachedTokens * cachePrice + usage.output_tokens * outputPrice) / 1_000_000;
}

function decodeResponse(raw: unknown, context: ReceiptValidationContext, isSimulated: boolean): ReceiptAdapterOutcome {
  const fail = (code: string): ReceiptAdapterOutcome => ({
    status: 'error', code, analysis: { provider: 'backend', isSimulated, status: 'error', message: isSimulated
      ? 'Interpretação simulada indisponível. Continue preenchendo manualmente.'
      : 'Interpretação indisponível. Continue preenchendo manualmente.' }
  });
  if (!object(raw)) return fail('INVALID_RESPONSE');
  if (raw.status === 'failed') return fail(failureCode(raw.error));
  if (raw.status !== 'completed' || raw.incomplete_details != null) return fail('INCOMPLETE_RESPONSE');
  if (raw.error != null || !Array.isArray(raw.output) || !raw.output.length) return fail('INVALID_RESPONSE');
  // Reasoning items podem existir; ferramentas nunca são executadas ou aceitas.
  const messages: ObjectValue[] = [];
  for (const item of raw.output) {
    if (!object(item)) return fail('INVALID_RESPONSE');
    if (item.type === 'reasoning') continue;
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed' || !Array.isArray(item.content)) return fail('INVALID_RESPONSE');
    if (item.content.some(part => object(part) && part.type === 'refusal')) return fail('MODEL_REFUSAL');
    messages.push(item);
  }
  if (messages.length !== 1) return fail('INVALID_RESPONSE');
  const content = messages[0].content as unknown[];
  if (content.length !== 1 || !object(content[0]) || content[0].type !== 'output_text' || typeof content[0].text !== 'string' || Buffer.byteLength(content[0].text) > 65536) return fail('INVALID_RESPONSE');
  let parsed: unknown;
  try { parsed = JSON.parse(content[0].text); } catch { return fail('INVALID_JSON'); }
  if (!isReceiptExtraction(parsed)) return fail('INVALID_STRUCTURE');
  const validated = validateReceiptExtraction(parsed, context);
  if (!validated.valid) return fail('INVALID_EXTRACTION');
  const { assessment, analysis } = validated;
  const status = assessment.acceptance === 'rejected' ? 'rejected'
    : assessment.acceptance === 'undetermined' || analysis.status === 'error' ? 'inconclusive' : analysis.status;
  return { status, assessment, analysis: { ...analysis, isSimulated, message: isSimulated ? `Simulação: ${analysis.message}` : analysis.message } };
}

export function createReceiptOpenAIAdapter(transport: ReceiptResponsesTransport, options: {
  env?: NodeJS.ProcessEnv;
  origin?: ReceiptAnalysisOrigin;
  onMetrics?: (metrics: ReceiptAdapterMetrics) => void;
} = {}) {
  // Snapshot de configuração interna. Não aceitar a origem enviada pelo provedor.
  const { origin, isSimulated } = receiptAnalysisMetadata(options.origin ?? 'simulated');
  // Configuração capturada exclusivamente do servidor, nunca do documento/contexto.
  const source = options.env ?? process.env;
  const env = {
    RECEIPT_OPENAI_MODEL: source.RECEIPT_OPENAI_MODEL,
    RECEIPT_OPENAI_TIMEOUT_MS: source.RECEIPT_OPENAI_TIMEOUT_MS,
    RECEIPT_OPENAI_MAX_OUTPUT_TOKENS: source.RECEIPT_OPENAI_MAX_OUTPUT_TOKENS
  };
  return {
    async analyze(upload: ReceiptUpload, context: ReceiptValidationContext, signal?: AbortSignal): Promise<ReceiptAdapterResult> {
      const started = Date.now();
      const metrics: ReceiptAdapterMetrics = {
        model: 'unconfigured', isSimulated, status: 'error', durationMs: 0,
        inputTokens: null, cachedInputTokens: null, outputTokens: null, estimatedCostUsd: null
      };
      let outcome: ReceiptAdapterOutcome;
      let request: ReceiptResponsesRequest | undefined;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let externalAbort: (() => void) | undefined;
      let timedOut = false;
      try {
        // Etapa 6B.1: nenhum modo real executa o transporte, mesmo se injetado.
        if (origin !== 'simulated' || transport.mode !== origin) throw new ReceiptProviderFailure('INVALID_REQUEST');
        const config = receiptOpenAIConfig(env);
        metrics.model = config.model;
        if (signal?.aborted) throw new Error('cancelled');
        // O chamador deve validar bytes/páginas na Etapa 3. Não aceitar URI/URL.
        if (!Buffer.isBuffer(upload.bytes) || !upload.bytes.length || upload.bytes.length > 10 * 1024 * 1024 || !['jpeg', 'png', 'pdf'].includes(upload.format)) throw new ReceiptProviderFailure('INVALID_REQUEST');
        const base64 = upload.bytes.toString('base64');
        request = {
          model: config.model, store: false, stream: false, instructions: receiptFiscalInstructions,
          input: [{ role: 'user', content: [
            { type: 'input_text', text: receiptCategoryContext(context) },
            upload.format === 'pdf'
              ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
              : { type: 'input_image', image_url: `data:image/${upload.format};base64,${base64}`, detail: 'high' }
          ] }],
          text: { format: { type: 'json_schema', name: 'receipt_extraction_v1', strict: true, schema: structuredClone(receiptExtractionSchema) } },
          max_output_tokens: config.maxOutputTokens
        };
        const raw = await new Promise<unknown>((resolve, reject) => {
          externalAbort = () => { controller.abort(); reject(new Error('cancelled')); };
          signal?.addEventListener('abort', externalAbort, { once: true });
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new ReceiptProviderFailure('TIMEOUT')); }, config.timeoutMs);
          // Uma única tentativa. Nenhum fallback de modelo ou retry automático.
          Promise.resolve().then(() => {
            if (controller.signal.aborted) throw new Error('cancelled');
            return transport.create(request!, { signal: controller.signal });
          }).then(resolve, reject);
        });
        const expectedModels = config.model.startsWith('gpt-5.4-mini')
          ? ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'] : ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'];
        if (object(raw) && raw.model !== undefined && !expectedModels.includes(raw.model as string)) {
          outcome = { status: 'error', code: 'UNEXPECTED_MODEL', analysis: { provider: 'backend', isSimulated, status: 'error', message: isSimulated ? 'Resposta simulada incompatível com o modelo configurado.' : 'Resposta incompatível com o modelo configurado.' } };
        } else {
          measureUsage(raw, metrics, config.model);
          outcome = signal?.aborted ? { status: 'cancelled', code: 'CANCELLED', analysis: { provider: 'backend', isSimulated, status: 'error', message: isSimulated ? 'Operação simulada cancelada.' : 'Operação cancelada.' } } : decodeResponse(raw, context, isSimulated);
        }
      } catch (error) {
        outcome = {
          status: !timedOut && signal?.aborted ? 'cancelled' : 'error',
          code: timedOut ? 'TIMEOUT' : signal?.aborted ? 'CANCELLED' : failureCode(error),
          analysis: { provider: 'backend', isSimulated, status: 'error', message: isSimulated
            ? 'Não foi possível interpretar o documento na simulação. Continue preenchendo manualmente.'
            : 'Não foi possível interpretar o documento. Continue preenchendo manualmente.' }
        };
      } finally {
        if (timer) clearTimeout(timer);
        if (externalAbort) signal?.removeEventListener('abort', externalAbort);
        // Retirar referências do request, inclusive quando o double ignora abort.
        if (request) {
          for (const item of request.input) for (const part of item.content) {
            if (part.type === 'input_image') part.image_url = '';
            else if (part.type === 'input_file') part.file_data = '';
            else part.text = '';
          }
          request.input = [];
          request.instructions = '';
        }
      }
      metrics.status = outcome.status;
      metrics.durationMs = Date.now() - started;
      try { options.onMetrics?.({ ...metrics }); } catch { /* Observabilidade não altera o resultado. */ }
      // Manter a correlação literal entre origem, análise e métricas no contrato.
      return origin === 'simulated'
        ? { ...outcome, origin, analysis: { ...outcome.analysis, isSimulated: true }, metrics: { ...metrics, isSimulated: true } }
        : { ...outcome, origin, analysis: { ...outcome.analysis, isSimulated: false }, metrics: { ...metrics, isSimulated: false } };
    }
  };
}
