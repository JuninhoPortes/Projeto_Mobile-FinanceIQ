import { startReceiptPilot } from './receiptPilot';

// Sem dotenv, watcher ou respawn. Configuração temporária somente no processo.
void startReceiptPilot().then(server => {
  const address = server.address();
  console.log(JSON.stringify({ event: 'receipt_pilot_listening', host: '127.0.0.1', port: typeof address === 'object' ? address?.port : null }));
  const stop = () => { server.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}).catch(() => {
  // Não imprimir o erro original: pode conter caminhos/configuração sensível.
  console.error('Piloto bloqueado: confira isolamento, configuração e trava persistente.');
  process.exitCode = 1;
});
