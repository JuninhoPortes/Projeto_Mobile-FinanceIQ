export interface ReceiptUploadConfig {
  enabled: boolean;
  maxFileBytes: number;
  maxPdfPages: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  perMinute: number;
  perDay: number;
  globalConcurrency: number;
  uploadTimeoutMs: number;
  validationTimeoutMs: number;
  processingTimeoutMs: number;
}

export function receiptUploadConfig(env: NodeJS.ProcessEnv): ReceiptUploadConfig {
  const integer = (name: string, fallback: number, max: number) => {
    const text = env[name];
    if (text === undefined) return fallback;
    const value = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid upload configuration');
    return value;
  };
  return {
    // Não representar o controle em memória como distribuído. Produção falha fechada.
    enabled: env.RECEIPT_LIMITS_MODE === 'local-single-process' && env.NODE_ENV !== 'production',
    maxFileBytes: integer('RECEIPT_MAX_FILE_BYTES', 10 * 1024 * 1024, 10 * 1024 * 1024),
    maxPdfPages: integer('RECEIPT_MAX_PDF_PAGES', 3, 3),
    maxWidth: integer('RECEIPT_MAX_IMAGE_WIDTH', 10000, 12000),
    maxHeight: integer('RECEIPT_MAX_IMAGE_HEIGHT', 10000, 12000),
    maxPixels: integer('RECEIPT_MAX_IMAGE_PIXELS', 20_000_000, 20_000_000),
    perMinute: integer('RECEIPT_REQUESTS_PER_MINUTE', 5, 100),
    perDay: integer('RECEIPT_REQUESTS_PER_DAY', 30, 10000),
    globalConcurrency: integer('RECEIPT_GLOBAL_CONCURRENCY', 4, 4),
    uploadTimeoutMs: integer('RECEIPT_UPLOAD_TIMEOUT_MS', 20000, 60000),
    validationTimeoutMs: integer('RECEIPT_VALIDATION_TIMEOUT_MS', 8000, 15000),
    processingTimeoutMs: integer('RECEIPT_PROCESSING_TIMEOUT_MS', 15000, 45000)
  };
}

interface Counter { day: string; daily: number; recent: number[]; active: boolean }

// Apenas piloto local: uma aplicação, um processo. Não é um lock distribuído.
export class LocalReceiptLimits {
  private users = new Map<string, Counter>();
  private active = 0;
  constructor(private config: ReceiptUploadConfig, private now = Date.now) {}

  acquire(uid: string): { release: () => void } | null {
    const time = this.now();
    const day = new Date(time).toISOString().slice(0, 10);
    // Limitar também a memória dos contadores. Sem apagar quotas ainda válidas.
    for (const [key, value] of this.users) {
      if (value.day !== day && !value.active && value.recent.every(requestTime => requestTime <= time - 60000)) this.users.delete(key);
    }
    const counter = this.users.get(uid) ?? { day, daily: 0, recent: [], active: false };
    if (counter.day !== day) { counter.day = day; counter.daily = 0; }
    counter.recent = counter.recent.filter(requestTime => requestTime > time - 60000);
    if (counter.active || this.active >= this.config.globalConcurrency || counter.daily >= this.config.perDay ||
      counter.recent.length >= this.config.perMinute || (!this.users.has(uid) && this.users.size >= 1000)) return null;
    counter.daily++;
    counter.recent.push(time);
    counter.active = true;
    this.active++;
    this.users.set(uid, counter);
    let released = false;
    return { release: () => {
      if (released) return;
      released = true;
      counter.active = false;
      this.active--;
    } };
  }
}
