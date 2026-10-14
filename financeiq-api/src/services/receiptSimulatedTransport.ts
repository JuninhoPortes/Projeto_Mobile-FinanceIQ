import type { ReceiptResponsesRequest, ReceiptResponsesTransport } from '../types/receiptOpenAI';

type SimulatedReceiptReply = (request: ReceiptResponsesRequest, options: { signal: AbortSignal }) => unknown;
interface SimulatedReceiptTransport extends ReceiptResponsesTransport { whenIdle(): Promise<void> }

// Transporte falso da Etapa 4 promovido para uso interno. Não armazena requests,
// bytes, respostas ou histórico; instrumentação com cópias continua só nos testes.
export function createSimulatedReceiptTransport(reply: SimulatedReceiptReply): SimulatedReceiptTransport;
export function createSimulatedReceiptTransport(reply: unknown): SimulatedReceiptTransport;
export function createSimulatedReceiptTransport(reply: unknown): SimulatedReceiptTransport {
  const active = new Set<Promise<void>>();
  const transport: ReceiptResponsesTransport & { whenIdle(): Promise<void> } = {
    mode: 'simulated',
    create(request, options) {
      const task = Promise.resolve().then(() => {
        if (options.signal.aborted) throw new Error('Simulation cancelled');
        return typeof reply === 'function' ? reply(request, options) : structuredClone(reply);
      });
      // Rastrear término inclusive de doubles que demoram para confirmar abort.
      const settled = task.then(() => {}, () => {});
      active.add(settled);
      void settled.then(() => { active.delete(settled); });
      return task;
    },
    async whenIdle() {
      while (active.size) await Promise.all([...active]);
    }
  };
  return transport;
}
