import { mkdir, open } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { externalReceiptDirectory } from './receiptLocalConfig';
import { ReceiptProviderFailure } from './receiptOpenAIAdapter';

// Registro próprio do modo operacional; não importa nem consulta a trava do piloto.
export async function createReceiptLocalAttempts(directory: string, dailyLimit: number, now = () => new Date()) {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10) throw new ReceiptProviderFailure('INVALID_CONFIGURATION');
  const parent = await externalReceiptDirectory(directory);
  const folder = join(parent, 'operational-attempts');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const canonical = await externalReceiptDirectory(folder);
  if (relative(parent, canonical) !== 'operational-attempts') throw new ReceiptProviderFailure('INVALID_CONFIGURATION');
  return async () => {
    const day = now().toISOString().slice(0, 10); // UTC; não depender do relógio do cliente HTTP.
    for (let slot = 1; slot <= dailyLimit; slot++) {
      let file;
      try { file = await open(join(canonical, `local-${day}-${slot}.attempt`), 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw new ReceiptProviderFailure('UNAVAILABLE');
      }
      try { await file.writeFile('financeiq-local-attempt-v1\n'); await file.sync(); }
      catch { throw new ReceiptProviderFailure('UNAVAILABLE'); }
      finally { await file.close(); }
      return; // Consumido antes de enviar, inclusive se o provedor falhar/cancelar.
    }
    throw new ReceiptProviderFailure('RATE_LIMIT');
  };
}
