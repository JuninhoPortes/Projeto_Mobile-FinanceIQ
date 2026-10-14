import { auth } from '../../firebaseConfig';
import { api } from './api';
import { normalizeReceiptDocument } from './receiptDocumentService';
import { createReceiptMultipart } from './receiptMultipartService';
import { parseSimulatedReceiptResponse } from './receiptBackendResponseService';
import type { ReceiptAnalysisResult, ReceiptInterpretationService } from '../types/receipt';

const messages: Record<number, string> = {
  400: 'Não foi possível enviar a nota. Selecione o arquivo novamente.',
  401: 'Sua sessão não é válida para analisar a nota. Entre novamente.',
  403: 'A análise de notas não está autorizada para sua conta.',
  413: 'O arquivo excede o limite de 10 MiB. Escolha um arquivo menor.',
  415: 'Formato não permitido. Escolha JPG/JPEG, PNG ou PDF.',
  422: 'Documento inválido ou protegido. Escolha outra nota.',
  429: 'Limite de análise atingido. Aguarde antes de tentar novamente.',
  501: 'A análise de notas está indisponível. Continue preenchendo manualmente.',
  503: 'Serviço de análise indisponível. Tente novamente mais tarde.',
  504: 'A análise demorou demais. Tente novamente ou preencha manualmente.'
};
const failure = (message: string): ReceiptAnalysisResult => ({ provider: 'backend', isSimulated: true, status: 'error', message });
const cancelled = (): ReceiptAnalysisResult => ({ provider: 'backend', isSimulated: true, status: 'cancelled', message: 'Operação cancelada.' });

export function createReceiptBackendService(timeoutMs = 45000): ReceiptInterpretationService {
  return {
    async analyze(document, _context, signal) {
      if (signal?.aborted) return cancelled();
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      let interrupt: () => void = () => {};
      const interrupted = new Promise<ReceiptAnalysisResult>(resolve => {
        interrupt = () => resolve(timedOut ? failure(messages[504]) : cancelled());
        controller.signal.addEventListener('abort', interrupt, { once: true });
      });
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      const execute = async (): Promise<ReceiptAnalysisResult> => {
        const normalized = normalizeReceiptDocument(document);
        const user = auth.currentUser;
        if (!user) return failure(messages[401]);
        const base = api.defaults.baseURL;
        if (!base || base.includes('IP_DO_COMPUTADOR')) return failure(messages[501]);
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return failure(messages[501]);
        url.pathname = url.pathname.replace(/\/$/, '') + '/receipts/analyze';
        let token: string;
        try { token = await user.getIdToken(); } catch { return failure(messages[401]); }
        if (controller.signal.aborted) return cancelled();
        if (!token || auth.currentUser !== user) return failure(messages[401]);
        const body = await createReceiptMultipart(normalized, controller.signal);
        if (controller.signal.aborted) return cancelled();
        if (auth.currentUser !== user) return failure(messages[401]);
        const response = await fetch(url.toString(), {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
          signal: controller.signal, credentials: 'omit', redirect: 'error'
        });
        if (controller.signal.aborted) return cancelled();
        if (auth.currentUser !== user) return failure(messages[401]);
        if (response.status !== 200) return failure(messages[response.status] ?? messages[503]);
        const value: unknown = await response.json();
        if (controller.signal.aborted) return cancelled();
        if (auth.currentUser !== user) return failure(messages[401]);
        return parseSimulatedReceiptResponse(value);
      };
      try {
        return await Promise.race([execute().catch(() => failure('Não foi possível comunicar com o serviço de análise. Os campos foram preservados.')), interrupted]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.signal.removeEventListener('abort', interrupt);
        controller.abort();
      }
    }
  };
}

export const receiptBackendService = createReceiptBackendService();
