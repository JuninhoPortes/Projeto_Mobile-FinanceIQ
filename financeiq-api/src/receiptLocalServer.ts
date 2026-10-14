import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadReceiptLocalConfig } from './services/receiptLocalConfig';
import { startReceiptLocal } from './receiptLocal';

async function main() {
  const defaultFile = join(process.env.LOCALAPPDATA ?? join(homedir(), '.config'), 'FinanceIQ', 'receipt-local', 'backend.env');
  const { values, directory } = await loadReceiptLocalConfig(process.argv[2] ?? defaultFile);
  // Firebase Admin usa ADC do processo. Nenhuma configuração é enviada ao frontend.
  for (const key of ['FIREBASE_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS']) {
    if (values[key]) process.env[key] = values[key];
  }
  const server = await startReceiptLocal(values, directory);
  const address = server.address();
  console.log(JSON.stringify({ event: 'receipt_local_listening', host: '127.0.0.1', port: typeof address === 'object' ? address?.port : null }));
  process.once('SIGINT', () => server.close());
  process.once('SIGTERM', () => server.close());
}
void main().catch(() => {
  console.error('Análise local bloqueada. Confira backend.env externo, flags, UID, Firebase/ADC e limites. Consulte docs/receipts-local.md.');
  process.exitCode = 1;
});
