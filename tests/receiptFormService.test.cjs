const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const { prepareReceiptFormPatch } = loadTypeScript('src/services/receiptFormService.ts');
const categories = [
  { name: 'Receita', type: 'income', is_active: true },
  { name: 'Alimentação', type: 'outcome', is_active: true },
  { name: 'Lazer', type: 'outcome', is_active: true },
  { name: 'Inativa', type: 'outcome', is_active: false }
];
const current = { type: 'outcome', category: 'Lazer' };
const result = fields => ({ status: 'partial', provider: 'mock', isSimulated: true, fields });
const plain = value => JSON.parse(JSON.stringify(value));

test('patch contém somente campos financeiros válidos, sem data ou metadados', () => {
  const patch = prepareReceiptFormPatch(result({
    description: ' Compra simulada ', amount: 129.90, type: 'outcome', category: ' alimentação ',
    identifiedDate: '2026-09-15', date: 'ignored', period_month: 'ignored', source: 'ignored'
  }), current, categories);
  assert.deepEqual(plain(patch), {
    description: 'Compra simulada', amount: 129.90, type: 'outcome', category: 'Alimentação'
  });
});

test('leitura parcial preserva categoria e tipo já preenchidos', () => {
  const patch = prepareReceiptFormPatch(result({ description: 'Parcial', amount: 50 }), current, categories);
  assert.deepEqual(plain(patch), { description: 'Parcial', amount: 50 });
});

test('campos inválidos não apagam valores anteriores', () => {
  const patch = prepareReceiptFormPatch(result({
    description: ' ', amount: NaN, type: 'invalid', category: 'Inativa'
  }), current, categories);
  assert.deepEqual(plain(patch), {});
  for (const amount of [0, -1, Infinity, 0.001, Number.MAX_VALUE, '50']) {
    assert.equal('amount' in prepareReceiptFormPatch(result({ amount }), current, categories), false);
  }
});

test('categoria inexistente ou de outro tipo não é aplicada', () => {
  for (const category of ['Não existe', 'Receita', 'Inativa']) {
    assert.deepEqual(plain(prepareReceiptFormPatch(result({ category }), current, categories)), {});
  }
});

test('mudança de tipo desmarca apenas a categoria incompatível', () => {
  assert.deepEqual(plain(prepareReceiptFormPatch(result({ type: 'income' }), current, categories)), {
    type: 'income', category: ''
  });
  assert.deepEqual(plain(prepareReceiptFormPatch(result({ type: 'income', category: 'Receita' }), current, categories)), {
    type: 'income', category: 'Receita'
  });
});

test('erro e cancelamento não produzem patch', () => {
  for (const status of ['error', 'cancelled']) {
    assert.deepEqual(plain(prepareReceiptFormPatch({ status }, current, categories)), {});
  }
});
