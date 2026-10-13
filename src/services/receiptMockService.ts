import type {
  ReceiptAnalysisContext,
  ReceiptAnalysisResult,
  ReceiptInterpretationService,
  ReceiptMockOptions
} from '../types/receipt';
import { normalizeReceiptDocument } from './receiptDocumentService';

function waitForMock(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);

  return new Promise(resolve => {
    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      resolve(completed);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), delayMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

function selectExistingCategory(context: ReceiptAnalysisContext): string | undefined {
  const activeCategories = context.categories.filter(category =>
    category.is_active && category.type === 'outcome' && category.name.trim() !== ''
  );
  const normalize = (name: string) => name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return activeCategories.find(category => normalize(category.name) === 'alimentacao')?.name
    ?? activeCategories.find(category => normalize(category.name) === 'outros')?.name
    ?? activeCategories[0]?.name;
}

const cancelledResult = (): ReceiptAnalysisResult => ({
  status: 'cancelled', provider: 'mock', isSimulated: true,
  message: 'Análise simulada cancelada. Nenhum dado foi aplicado ao formulário.'
});

export function createReceiptMockService(
  options: Readonly<ReceiptMockOptions>
): ReceiptInterpretationService {
  // Copia a configuração para não mudar o cenário de uma análise em andamento.
  const scenario = options.scenario;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, Math.min(options.delayMs, 5000))
    : 1200;

  return {
    async analyze(document, context, signal) {
      if (signal?.aborted) return cancelledResult();

      try {
        // Confere somente metadados. Não lê imagem/PDF, não faz OCR nem upload.
        normalizeReceiptDocument(document);
      } catch {
        return {
          status: 'error', provider: 'mock', isSimulated: true,
          message: 'Documento inválido para a análise simulada. Selecione novamente a nota.'
        };
      }

      // Define a categoria antes da espera para não depender de mutações do contexto.
      const category = selectExistingCategory(context);
      const completed = await waitForMock(delayMs, signal);
      if (!completed || signal?.aborted) return cancelledResult();

      if (scenario === 'error') {
        return {
          status: 'error', provider: 'mock', isSimulated: true,
          message: 'Falha simulada ao analisar a nota fiscal. Você pode tentar novamente ou preencher manualmente.'
        };
      }

      if (scenario === 'partial') {
        return {
          status: 'partial', provider: 'mock', isSimulated: true,
          message: 'Leitura parcial simulada: somente descrição e valor fictícios estão disponíveis. Revise os demais campos.',
          fields: { description: 'Compra simulada — Mercado', amount: 129.90 }
        };
      }

      const fields = {
        description: 'Compra simulada — Mercado', amount: 129.90,
        type: 'outcome' as const,
        identifiedDate: '2026-09-15'
      };

      if (!category) {
        return {
          status: 'partial', provider: 'mock', isSimulated: true,
          message: 'Dados simulados disponíveis, sem categoria ativa de saída. Escolha uma categoria no formulário.',
          fields
        };
      }

      return {
        status: 'success', provider: 'mock', isSimulated: true,
        message: 'Análise simulada concluída. Os valores são fictícios; o documento não foi interpretado. Revise antes de salvar.',
        fields: { ...fields, category }
      };
    }
  };
}
