import type { ReceiptAnalysisResult, ReceiptRecognizedFields } from '../types/receipt';

const names = ['merchant', 'description', 'amount', 'type', 'category', 'identifiedDate'];
const applicableNames = ['description', 'amount', 'type', 'category', 'identifiedDate'] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fieldList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string' && names.includes(item));
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 500;

export function parseSimulatedReceiptResponse(value: unknown): ReceiptAnalysisResult {
  const invalid = (): ReceiptAnalysisResult => ({
    provider: 'backend', isSimulated: true, status: 'error',
    message: 'Resposta de análise inválida. Os campos foram preservados. Continue preenchendo manualmente.'
  });
  if (!object(value) || value.provider !== 'backend' || value.isSimulated !== true || !object(value.assessment)) return invalid();
  const assessment = value.assessment;
  if (!object(assessment.fields) || !fieldList(assessment.missingFields) || !fieldList(assessment.uncertainFields) ||
    !Array.isArray(assessment.reasonCodes) || !assessment.reasonCodes.every(code => typeof code === 'string')) return invalid();

  if (value.documentStatus === 'rejected' || value.documentStatus === 'inconclusive') {
    if (value.status !== 'error' || 'fields' in value || Object.keys(assessment.fields).length ||
      assessment.acceptance !== (value.documentStatus === 'rejected' ? 'rejected' : 'undetermined')) return invalid();
    return {
      provider: 'backend', isSimulated: true, status: 'error',
      message: value.documentStatus === 'rejected'
        ? 'Simulação: documento incompatível. Escolha outra nota ou preencha manualmente.'
        : 'Simulação: não foi possível ler o documento. Escolha outra nota ou preencha manualmente.'
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
      if (!Number.isSafeInteger(cents) || cents <= 0 || Math.abs(entry - cents / 100) > Number.EPSILON * Math.max(1, Math.abs(entry))) return invalid();
      fields.amount = cents / 100;
    } else if (name === 'type') {
      if (entry !== 'income' && entry !== 'outcome') return invalid();
      fields.type = entry;
    } else {
      if (!text(entry)) return invalid();
      if (name === 'identifiedDate' && (!/^\d{4}-\d{2}-\d{2}$/.test(entry) ||
        !Number.isFinite(Date.parse(entry)) || new Date(entry).toISOString().slice(0, 10) !== entry)) return invalid();
      fields[name] = entry.trim();
    }
  }
  const metadata = { provider: 'backend' as const, isSimulated: true,
    message: 'Dados demonstrativos, não extraídos do documento. Revise os campos e complete as informações antes de salvar.' };
  if (value.status === 'success') {
    const { description, amount, type, category } = fields;
    if (description === undefined || amount === undefined || type === undefined || category === undefined) return invalid();
    return { ...metadata, status: 'success', fields: { ...fields, description, amount, type, category } };
  }
  if (!['description', 'amount', 'type', 'category'].some(name => name in fields)) return invalid();
  return { ...metadata, status: 'partial', fields };
}
