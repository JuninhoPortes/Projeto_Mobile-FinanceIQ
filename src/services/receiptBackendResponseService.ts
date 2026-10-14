import type { ReceiptAnalysisResult, ReceiptRecognizedFields } from '../types/receipt';

const names = ['merchant', 'description', 'amount', 'type', 'category', 'identifiedDate'];
const applicableNames = ['description', 'amount', 'type', 'category', 'identifiedDate'] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fieldList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= names.length && new Set(value).size === value.length &&
  value.every(item => typeof item === 'string' && names.includes(item));
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 500;

export function parseReceiptBackendResponse(value: unknown, mode: 'simulated' | 'real'): ReceiptAnalysisResult {
  const isSimulated = mode === 'simulated';
  const invalid = (): ReceiptAnalysisResult => ({
    provider: 'backend', isSimulated, status: 'error',
    message: 'Resposta de análise inválida. Os campos foram preservados. Continue preenchendo manualmente.'
  });
  if (!['simulated', 'real'].includes(mode) || !object(value) || value.provider !== 'backend' || value.isSimulated !== isSimulated || !object(value.assessment)) return invalid();
  const assessment = value.assessment;
  if (!object(assessment.fields) || !fieldList(assessment.missingFields) || !fieldList(assessment.uncertainFields) ||
    !Array.isArray(assessment.reasonCodes) || assessment.reasonCodes.length > 64 ||
    !assessment.reasonCodes.every(code => typeof code === 'string' && /^[A-Z_]{1,80}$/.test(code))) return invalid();
  const uncertainFields = assessment.uncertainFields;
  if (assessment.missingFields.some(name => uncertainFields.includes(name))) return invalid();

  if (value.documentStatus === 'rejected' || value.documentStatus === 'inconclusive') {
    if (value.status !== 'error' || 'fields' in value) return invalid();
    if (value.documentStatus === 'rejected') {
      if (assessment.acceptance !== 'rejected' || Object.keys(assessment.fields).length) return invalid();
    } else if (assessment.acceptance === 'undetermined') {
      if (Object.keys(assessment.fields).length) return invalid();
    } else if (assessment.acceptance === 'accepted') {
      // Data isolada pode ser informativa, sem permitir aplicação de lançamento.
      if (Object.keys(assessment.fields).some(name => name !== 'identifiedDate')) return invalid();
      const date = assessment.fields.identifiedDate;
      if (date !== undefined && (!validDate(date) || assessment.missingFields.includes('identifiedDate') || assessment.uncertainFields.includes('identifiedDate'))) return invalid();
    } else return invalid();
    return {
      provider: 'backend', isSimulated, status: 'error', documentStatus: value.documentStatus,
      message: (isSimulated ? 'Simulação: ' : '') + (value.documentStatus === 'rejected'
        ? 'Documento incompatível ou com múltiplos documentos. Escolha outra nota ou preencha manualmente. Os campos foram preservados.'
        : 'Análise inconclusiva: não foi possível obter campos seguros de lançamento. Escolha outra nota ou preencha manualmente. Os campos foram preservados.')
    };
  }
  if ((value.documentStatus !== 'success' && value.documentStatus !== 'partial') || value.status !== value.documentStatus ||
    assessment.acceptance !== 'accepted' || !object(value.fields)) return invalid();
  const fields: ReceiptRecognizedFields = {};
  if (Object.keys(value.fields).some(key => !applicableNames.some(name => name === key)) ||
    Object.keys(assessment.fields).some(key => !applicableNames.some(name => name === key))) return invalid();
  for (const name of applicableNames) {
    const entry = value.fields[name];
    if (entry !== assessment.fields[name]) return invalid();
    if (entry === undefined) continue;
    if (assessment.missingFields.includes(name) || assessment.uncertainFields.includes(name)) return invalid();
    if (name === 'amount') {
      if (typeof entry !== 'number' || !Number.isFinite(entry)) return invalid();
      const cents = Math.round(entry * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000 || Math.abs(entry - cents / 100) > Number.EPSILON * Math.max(1, Math.abs(entry))) return invalid();
      fields.amount = cents / 100;
    } else if (name === 'type') {
      if (entry !== 'income' && entry !== 'outcome') return invalid();
      fields.type = entry;
    } else {
      if (!text(entry)) return invalid();
      if (name === 'identifiedDate' && !validDate(entry)) return invalid();
      fields[name] = entry.trim();
    }
  }
  if (fields.category !== undefined && fields.type === undefined) return invalid();
  const metadata: Pick<ReceiptAnalysisResult, 'provider' | 'isSimulated' | 'documentStatus' | 'message'> = { provider: 'backend', isSimulated, documentStatus: value.documentStatus,
    message: isSimulated
      ? 'Dados demonstrativos, não extraídos do documento. Revise os campos e complete as informações antes de salvar.'
      : value.status === 'partial'
        ? 'Leitura parcial do documento. Revise os campos reconhecidos e complete as informações ausentes. Nenhum lançamento foi salvo.'
        : 'Dados reconhecidos no documento. Confira e corrija os campos antes de salvar. Nenhum lançamento foi salvo.' };
  if (value.status === 'success') {
    const { description, amount, type, category } = fields;
    if (description === undefined || amount === undefined || type === undefined || category === undefined) return invalid();
    return { ...metadata, status: 'success', fields: { ...fields, description, amount, type, category } };
  }
  if (!['description', 'amount', 'type', 'category'].some(name => name in fields)) return invalid();
  return { ...metadata, status: 'partial', fields };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// Compatibilidade com consumidores existentes que exigem simulação explícita.
export function parseSimulatedReceiptResponse(value: unknown): ReceiptAnalysisResult {
  return parseReceiptBackendResponse(value, 'simulated');
}
