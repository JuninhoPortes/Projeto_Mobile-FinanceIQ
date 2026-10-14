import { constants } from 'node:fs';
import { access, lstat, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ReceiptProviderFailure } from './receiptOpenAIAdapter';

// Nome fixo: nenhuma requisição HTTP escolhe ou rearma uma autorização.
const markerName = 'receipt-openai-first-attempt.lock';
const unavailable = () => new ReceiptProviderFailure('UNAVAILABLE');

export async function createReceiptPilotLock(directory: string | undefined) {
  let marker: string;
  try {
    if (!directory || !isAbsolute(directory)) throw unavailable();
    // Resolver junctions/symlinks antes de verificar a localização efetiva.
    const folder = await realpath(directory);
    const repository = await realpath(resolve(__dirname, '../../..'));
    const fromRepository = relative(repository, folder);
    if (!fromRepository || (!isAbsolute(fromRepository) && fromRepository !== '..' && !fromRepository.startsWith(`..${sep}`))) throw unavailable();
    if (!(await stat(folder)).isDirectory()) throw unavailable();
    await access(folder, constants.W_OK);
    marker = resolve(folder, markerName);
    try {
      await lstat(marker);
      throw unavailable(); // Inclui marcador vazio ou symlink: nunca reutilizar.
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw unavailable();
    }
  } catch { throw unavailable(); }

  let spent = false;
  return Object.freeze({
    async consume(): Promise<void> {
      if (spent) throw unavailable();
      spent = true;
      try {
        // O_EXCL é a autoridade entre processos; a flag em memória é adicional.
        const file = await open(marker, 'wx', 0o600);
        try {
          await file.writeFile('financeiq-receipt-pilot-v1\n');
          await file.sync();
        } finally { await file.close(); }
      } catch {
        // Até um arquivo vazio permanece consumido. Não apagar nem tentar de novo.
        throw unavailable();
      }
    }
  });
}
