const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const contract = loadTypeScript('financeiq-api/src/types/receiptExtraction.ts');
const { receiptExtractionSchema } = loadTypeScript('financeiq-api/src/schemas/receiptExtractionSchema.ts', {
  '../types/receiptExtraction': contract
});
const { isReceiptExtraction, validateReceiptExtraction, DEFAULT_MAX_RECEIPT_AMOUNT_CENTS } = loadTypeScript(
  'financeiq-api/src/services/receiptExtractionValidation.ts', { '../types/receiptExtraction': contract }
);
const { prepareReceiptFormPatch } = loadTypeScript('src/services/receiptFormService.ts');
const fixture = require('./fixtures/receiptExtraction.json');
const fresh = () => structuredClone(fixture);
const plain = value => JSON.parse(JSON.stringify(value));
const categories = [
  { name: 'Alimentação', type: 'outcome', is_active: true },
  { name: 'Receita', type: 'income', is_active: true },
  { name: 'Inativa', type: 'outcome', is_active: false }
];
const validate = (input, extra = {}) => validateReceiptExtraction(input, { categories, ...extra });
const patch = result => plain(prepareReceiptFormPatch(result.analysis, { type: 'outcome', category: 'Alimentação' }, categories));

test('contrato completo converte centavos e permanece compatível com o patch atual', () => {
  const input = fresh();
  const before = structuredClone(input);
  const result = validate(input);
  assert.equal(result.valid, true);
  assert.equal(result.assessment.acceptance, 'accepted');
  assert.equal(result.analysis.status, 'success');
  assert.equal(result.analysis.provider, 'backend');
  assert.equal(result.analysis.isSimulated, false);
  assert.deepEqual(patch(result), { description: 'Compra em Mercado de Teste', amount: 129.9, type: 'outcome', category: 'Alimentação' });
  assert.equal(result.analysis.fields.identifiedDate, '2026-09-15');
  assert.deepEqual(input, before);
});

test('política aceita exclusivamente as quatro classificações fiscais explícitas e claras', () => {
  for (const classification of ['nfe', 'nfce', 'nfse', 'fiscal_receipt']) {
    const input = fresh();
    input.document.classification = classification;
    assert.equal(validate(input).assessment.acceptance, 'accepted');
  }
  const input = fresh();
  input.document.classification = 'bank_statement';
  assert.equal(validate(input).valid, false);
});

test('documento incompatível não fornece campos mesmo contendo valores plausíveis', () => {
  const input = fresh();
  input.document.classification = 'other';
  const result = validate(input);
  assert.equal(result.assessment.acceptance, 'rejected');
  assert.ok(result.assessment.reasonCodes.includes('INCOMPATIBLE_DOCUMENT'));
  assert.deepEqual(plain(result.assessment.fields), {});
  assert.equal(result.analysis.status, 'error');
  assert.equal('fields' in result.analysis, false);
  assert.deepEqual(patch(result), {});
});

test('classificação desconhecida ou incerta nunca permite aplicar campos', () => {
  for (const certainty of ['missing', 'inferred', 'uncertain']) {
    const input = fresh();
    input.document.certainty = certainty;
    const result = validate(input);
    assert.equal(result.assessment.acceptance, 'undetermined');
    assert.deepEqual(patch(result), {});
  }
  const input = fresh();
  input.document.classification = 'unknown';
  assert.equal(validate(input).analysis.status, 'error');
});

test('documentos ilegíveis e PDFs com vários documentos não produzem lançamentos', () => {
  const unreadable = fresh();
  unreadable.document.readability = 'unreadable';
  assert.ok(validate(unreadable).assessment.reasonCodes.includes('UNREADABLE_DOCUMENT'));
  assert.deepEqual(patch(validate(unreadable)), {});
  const multiple = fresh();
  multiple.document.multipleDocuments = true;
  assert.equal(validate(multiple).assessment.acceptance, 'rejected');
  assert.deepEqual(patch(validate(multiple)), {});
});

test('legibilidade parcial permanece parcial mesmo com campos completos', () => {
  const input = fresh();
  input.document.readability = 'partial';
  assert.equal(validate(input).analysis.status, 'partial');
});

test('campos ausentes são explícitos no contrato e omitidos no resultado compatível', () => {
  const input = fresh();
  input.fields.amount = { valueCents: null, currency: null, certainty: 'missing' };
  input.fields.category = { value: null, certainty: 'missing' };
  const result = validate(input);
  assert.equal(result.analysis.status, 'partial');
  assert.deepEqual(plain(result.assessment.missingFields), ['amount', 'category']);
  assert.equal('amount' in result.analysis.fields, false);
  assert.equal('category' in result.analysis.fields, false);
  assert.equal('amount' in patch(result), false);
});

test('campos incertos ou inferidos não substituem valores do formulário', () => {
  for (const certainty of ['uncertain', 'inferred']) {
    const input = fresh();
    for (const entry of Object.values(input.fields)) entry.certainty = certainty;
    const result = validate(input);
    assert.equal(result.analysis.status, 'error');
    assert.equal(result.assessment.uncertainFields.length, 6);
    assert.deepEqual(patch(result), {});
  }
});

test('valor incerto é omitido sem descartar descrição legível', () => {
  const input = fresh();
  input.fields.amount.certainty = 'uncertain';
  const result = validate(input);
  assert.equal(result.analysis.status, 'partial');
  assert.equal(patch(result).description, 'Compra em Mercado de Teste');
  assert.equal('amount' in patch(result), false);
});

test('validação estrutural rejeita omissões, propriedades extras, tipos e enums inválidos', () => {
  const invalid = [null, [], {}, { ...fresh(), schemaVersion: '2' }];
  for (const mutate of [
    value => { delete value.fields.amount; },
    value => { value.fields.amount.valueCents = '12990'; },
    value => { value.fields.amount.valueCents = 129.9; },
    value => { value.fields.type.value = 'expense'; },
    value => { value.fields.description.certainty = 'high'; },
    value => { value.fields.description.extra = true; },
    value => { value.fields.date = '2020-01-01'; },
    value => { value.fields.period_month = '2020-01'; },
    value => { value.source = 'manual'; },
    value => { value.document.readability = 'good'; },
    value => { value.document.multipleDocuments = 'false'; }
  ]) {
    const input = fresh();
    mutate(input);
    invalid.push(input);
  }
  for (const input of invalid) {
    assert.equal(isReceiptExtraction(input), false);
    assert.equal(validate(input).valid, false);
  }
});

test('validade estrutural não implica coerência semântica ou correção factual', () => {
  const input = fresh();
  input.fields.description = { value: null, certainty: 'clear' };
  assert.equal(isReceiptExtraction(input), true);
  assert.equal(validate(input).valid, false);
  input.fields.description = { value: 'Descrição plausível que pode estar errada', certainty: 'clear' };
  assert.equal(validate(input).valid, true); // A revisão humana verifica a fidelidade ao documento.
});

test('nulabilidade e indicação de ausência precisam ser consistentes', () => {
  for (const mutate of [
    value => { value.fields.description.certainty = 'missing'; },
    value => { value.fields.amount.certainty = 'missing'; },
    value => { value.fields.category.value = null; },
    value => { value.fields.amount = { valueCents: null, currency: 'BRL', certainty: 'missing' }; }
  ]) {
    const input = fresh();
    mutate(input);
    assert.equal(validate(input).valid, false);
  }
});

test('centavos devem ser positivos, inteiros seguros e respeitar teto configurável', () => {
  for (const valueCents of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, DEFAULT_MAX_RECEIPT_AMOUNT_CENTS + 1]) {
    const input = fresh();
    input.fields.amount.valueCents = valueCents;
    assert.equal(validate(input).valid, false);
  }
  const input = fresh();
  input.fields.amount.valueCents = DEFAULT_MAX_RECEIPT_AMOUNT_CENTS;
  assert.equal(validate(input).valid, true);
  assert.equal(validate(fresh(), { maxAmountCents: 12989 }).valid, false);
  assert.equal(validate(fresh(), { maxAmountCents: 12990 }).valid, true);
  for (const maxAmountCents of [0, -1, 1.5, Infinity]) assert.equal(validate(fresh(), { maxAmountCents }).valid, false);
});

test('moeda desconhecida ou estrangeira nunca é convertida em reais', () => {
  for (const currency of [null, 'USD', 'EUR']) {
    const input = fresh();
    input.fields.amount.currency = currency;
    const result = validate(input);
    assert.equal(result.analysis.status, 'partial');
    assert.ok(result.assessment.reasonCodes.includes('UNSUPPORTED_OR_UNKNOWN_CURRENCY'));
    assert.equal('amount' in patch(result), false);
  }
  for (const currency of ['R$', '', 'brl']) {
    const input = fresh();
    input.fields.amount.currency = currency;
    assert.equal(validate(input).valid, false);
  }
});

test('categoria deve existir, estar ativa, ser única e corresponder ao tipo seguro', () => {
  for (const value of ['Inventada', 'Inativa', 'Receita']) {
    const input = fresh();
    input.fields.category.value = value;
    assert.equal('category' in validate(input).analysis.fields, false);
  }
  const ambiguous = validate(fresh(), { categories: [...categories, { name: ' alimentação ', type: 'outcome', is_active: true }] });
  assert.equal('category' in ambiguous.analysis.fields, false);
  const input = fresh();
  input.fields.type.certainty = 'inferred';
  const result = validate(input);
  assert.equal('type' in result.analysis.fields, false);
  assert.equal('category' in result.analysis.fields, false);
  assert.equal('category' in validate(fresh(), { categories: [] }).analysis.fields, false);
});

test('datas precisam existir no calendário e nunca entram no patch financeiro', () => {
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '15/09/2026', '0000-01-01']) {
    const input = fresh();
    input.fields.identifiedDate.value = value;
    assert.equal(validate(input).valid, false);
  }
  const input = fresh();
  input.fields.identifiedDate.value = '2024-02-29';
  const result = validate(input);
  assert.equal(result.valid, true);
  for (const key of ['date', 'period_month', 'identifiedDate', 'source', 'merchant']) assert.equal(key in patch(result), false);
});

test('textos vazios e excessivos não podem preencher campos', () => {
  for (const value of ['', '   ', 'a'.repeat(501)]) {
    const input = fresh();
    input.fields.description.value = value;
    assert.equal(validate(input).valid, false);
  }
});

test('somente estabelecimento ou data não cria resultado aplicável', () => {
  const input = fresh();
  for (const name of ['description', 'type', 'category']) input.fields[name] = { value: null, certainty: 'missing' };
  input.fields.amount = { valueCents: null, currency: null, certainty: 'missing' };
  const result = validate(input);
  assert.equal(result.analysis.status, 'error');
  assert.deepEqual(patch(result), {});
});

test('esquema declara campos obrigatórios, anuláveis e proíbe propriedades extras', () => {
  const fields = receiptExtractionSchema.properties.fields;
  assert.equal(receiptExtractionSchema.additionalProperties, false);
  assert.equal(fields.additionalProperties, false);
  assert.deepEqual(plain(fields.required), Object.keys(fixture.fields));
  assert.deepEqual(plain(fields.properties.amount.properties.valueCents.type), ['integer', 'null']);
  assert.deepEqual(plain(receiptExtractionSchema.properties.document.properties.classification.enum), plain(contract.receiptClassifications));
});
