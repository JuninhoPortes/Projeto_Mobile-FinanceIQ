import {
  receiptCertainties, receiptClassifications, receiptReadabilities,
  type ReceiptExtraction, type ReceiptFieldName, type ReceiptAssessment,
  type ReceiptValidationContext, type ValidatedReceiptAnalysis
} from '../types/receiptExtraction';

const fieldNames: ReceiptFieldName[] = ['merchant', 'description', 'amount', 'type', 'category', 'identifiedDate'];
// Teto inicial configurável: R$ 1 milhão; não é limite de Transaction.
export const DEFAULT_MAX_RECEIPT_AMOUNT_CENTS = 100_000_000;

type RecordValue = Record<string, unknown>;
function exactObject(value: unknown, keys: readonly string[]): value is RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function member(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

// Não faz coerção: strings monetárias, propriedades extras e campos omitidos falham.
export function isReceiptExtraction(value: unknown): value is ReceiptExtraction {
  if (!exactObject(value, ['schemaVersion', 'document', 'fields']) || value.schemaVersion !== '1') return false;
  const document = value.document;
  if (!exactObject(document, ['classification', 'certainty', 'readability', 'multipleDocuments']) ||
    !member(document.classification, receiptClassifications) ||
    !member(document.certainty, receiptCertainties) ||
    !member(document.readability, receiptReadabilities) || typeof document.multipleDocuments !== 'boolean') return false;
  const fields = value.fields;
  if (!exactObject(fields, fieldNames)) return false;
  return fieldNames.every(name => {
    const entry = fields[name];
    if (!exactObject(entry, name === 'amount' ? ['valueCents', 'currency', 'certainty'] : ['value', 'certainty']) ||
      !member(entry.certainty, receiptCertainties)) return false;
    if (name === 'amount') {
      return (entry.valueCents === null || (typeof entry.valueCents === 'number' && Number.isInteger(entry.valueCents))) &&
        (entry.currency === null || typeof entry.currency === 'string');
    }
    return name === 'type'
      ? entry.value === null || member(entry.value, ['income', 'outcome'])
      : entry.value === null || typeof entry.value === 'string';
  });
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type ReceiptValidationResult =
  | { valid: false; errors: string[] }
  | { valid: true; assessment: ReceiptAssessment; analysis: ValidatedReceiptAnalysis };

export function validateReceiptExtraction(input: unknown, context: ReceiptValidationContext): ReceiptValidationResult {
  if (!isReceiptExtraction(input)) return { valid: false, errors: ['INVALID_STRUCTURE'] };
  const errors: string[] = [];
  const max = context.maxAmountCents ?? DEFAULT_MAX_RECEIPT_AMOUNT_CENTS;
  if (!Number.isSafeInteger(max) || max <= 0) return { valid: false, errors: ['INVALID_AMOUNT_LIMIT'] };

  for (const name of fieldNames) {
    const entry = input.fields[name];
    const value = name === 'amount' ? input.fields.amount.valueCents : (entry as { value: unknown }).value;
    if ((value === null) !== (entry.certainty === 'missing')) errors.push(`INCONSISTENT_FIELD:${name}`);
    if (typeof value === 'string' && (!value.trim() || value.length > 500)) errors.push(`INVALID_TEXT:${name}`);
  }
  const amount = input.fields.amount;
  if (amount.valueCents !== null && (!Number.isSafeInteger(amount.valueCents) || amount.valueCents <= 0 || amount.valueCents > max)) {
    errors.push('INVALID_AMOUNT');
  }
  if (amount.currency !== null && !/^[A-Z]{3}$/.test(amount.currency)) errors.push('INVALID_CURRENCY');
  if (amount.valueCents === null && amount.currency !== null) errors.push('CURRENCY_WITHOUT_AMOUNT');
  const date = input.fields.identifiedDate.value;
  if (date !== null && !validDate(date)) errors.push('INVALID_IDENTIFIED_DATE');
  if (errors.length) return { valid: false, errors };

  const assessment: ReceiptAssessment = {
    acceptance: 'undetermined', reasonCodes: [], missingFields: [], uncertainFields: [], fields: {}
  };
  for (const name of fieldNames) {
    const certainty = input.fields[name].certainty;
    if (certainty === 'missing') assessment.missingFields.push(name);
    if (certainty === 'uncertain' || certainty === 'inferred') assessment.uncertainFields.push(name);
  }
  const document = input.document;
  if (document.multipleDocuments) {
    assessment.acceptance = 'rejected';
    assessment.reasonCodes.push('MULTIPLE_DOCUMENTS');
  } else if (document.readability === 'unreadable') {
    assessment.reasonCodes.push('UNREADABLE_DOCUMENT');
  } else if (document.certainty !== 'clear' || document.classification === 'unknown') {
    assessment.reasonCodes.push('UNDETERMINED_DOCUMENT');
  } else if (document.classification === 'other') {
    assessment.acceptance = 'rejected';
    assessment.reasonCodes.push('INCOMPATIBLE_DOCUMENT');
  } else {
    assessment.acceptance = 'accepted';
    const fields = assessment.fields;
    for (const name of ['description', 'identifiedDate'] as const) {
      const entry = input.fields[name];
      if (entry.certainty === 'clear' && entry.value !== null) fields[name] = entry.value.trim();
    }
    // Nem a classificação fiscal nem a descrição demonstram a perspectiva do usuário.
    if (input.fields.type.certainty === 'clear' && input.fields.type.value !== null) fields.type = input.fields.type.value;
    if (amount.valueCents !== null) {
      if (amount.currency !== 'BRL') assessment.reasonCodes.push('UNSUPPORTED_OR_UNKNOWN_CURRENCY');
      else if (amount.certainty === 'clear') fields.amount = amount.valueCents / 100;
    }
    const category = input.fields.category;
    if (category.value !== null && category.certainty === 'clear' && fields.type) {
      const matches = context.categories.filter(candidate => candidate.is_active && candidate.type === fields.type &&
        candidate.name.trim().toLowerCase() === category.value!.trim().toLowerCase());
      if (matches.length === 1) fields.category = matches[0].name;
      else assessment.reasonCodes.push('CATEGORY_NOT_RESOLVED');
    } else if (category.value !== null) assessment.reasonCodes.push('CATEGORY_NOT_RESOLVED');
  }

  const metadata = { provider: 'backend' as const, isSimulated: false as const };
  const fields = assessment.fields;
  let analysis: ValidatedReceiptAnalysis;
  if (assessment.acceptance !== 'accepted' || !['description', 'amount', 'type', 'category'].some(key => key in fields)) {
    analysis = { ...metadata, status: 'error', message: 'Não foi possível extrair campos seguros. Escolha outro documento ou preencha manualmente.' };
  } else if (document.readability === 'readable' && fields.description !== undefined && fields.amount !== undefined && fields.type !== undefined && fields.category !== undefined) {
    analysis = { ...metadata, status: 'success', fields: { ...fields, description: fields.description, amount: fields.amount, type: fields.type, category: fields.category }, message: 'Confira os dados reconhecidos antes de salvar.' };
  } else {
    analysis = { ...metadata, status: 'partial', fields, message: 'Leitura parcial. Confira os dados e preencha os campos ausentes ou incertos.' };
  }
  return { valid: true, assessment, analysis };
}
