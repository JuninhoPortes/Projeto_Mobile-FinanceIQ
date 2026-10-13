const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getEventListeners } = require('node:events');
const ts = require('typescript');

// Executa os serviços TS em memória, sem instalar runner ou gerar arquivos.
function loadService(relativePath, dependencies = {}, globals = {}) {
  const filePath = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Error, setTimeout, clearTimeout,
    require(name) {
      if (!(name in dependencies)) throw new Error('Dependência inesperada: ' + name);
      return dependencies[name];
    },
    ...globals
  }, { filename: filePath });
  return exports;
}

const documentService = loadService('src/services/receiptDocumentService.ts');
const mockModule = loadService('src/services/receiptMockService.ts', {
  './receiptDocumentService': documentService
});
const document = Object.freeze({
  uri: 'local://documento-inacessivel.jpg', name: 'nota.jpg',
  mimeType: 'image/jpeg', size: 1024, source: 'file'
});
const context = Object.freeze({ categories: Object.freeze([
  Object.freeze({ name: 'Receita', type: 'income', is_active: true }),
  Object.freeze({ name: 'Alimentação', type: 'outcome', is_active: true })
]) });
const create = (scenario, delayMs = 0) => mockModule.createReceiptMockService({ scenario, delayMs });

test('sucesso retorna dados fictícios completos sem ler o documento ou alterar entradas', async () => {
  const result = await create('success').analyze(document, context);
  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'mock');
  assert.equal(result.isSimulated, true);
  assert.match(result.message, /simulada/);
  assert.equal(result.fields.description, 'Compra simulada — Mercado');
  assert.equal(result.fields.amount, 129.90);
  assert.equal(result.fields.type, 'outcome');
  assert.equal(result.fields.category, 'Alimentação');
  assert.match(result.fields.identifiedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal('date' in result.fields, false);
  assert.equal('period_month' in result.fields, false);
  assert.equal('source' in result.fields, false);
});

test('leitura parcial omite campos ausentes em vez de retornar valores vazios', async () => {
  const result = await create('partial').analyze(document, context);
  assert.equal(result.status, 'partial');
  assert.equal(result.isSimulated, true);
  assert.deepEqual(Object.keys(result.fields).sort(), ['amount', 'description']);
});

test('erro simulado não retorna campos para aplicar', async () => {
  const result = await create('error').analyze(document, context);
  assert.equal(result.status, 'error');
  assert.equal(result.isSimulated, true);
  assert.match(result.message, /Falha simulada/);
  assert.equal('fields' in result, false);
});

test('resultado não depende do nome ou origem do arquivo', async () => {
  const service = create('success');
  const first = await service.analyze(document, context);
  const second = await service.analyze({
    ...document, name: 'relatorio.pdf', mimeType: 'application/pdf'
  }, context);
  assert.deepEqual(first, second);
});

test('sugere somente categorias ativas de saída existentes, com fallback', async () => {
  const fallback = await create('success').analyze(document, { categories: [
    { name: 'Alimentação', type: 'outcome', is_active: false },
    { name: 'Receita', type: 'income', is_active: true },
    { name: 'Outros', type: 'outcome', is_active: true }
  ] });
  assert.equal(fallback.fields.category, 'Outros');
  const custom = await create('success').analyze(document, { categories: [
    { name: 'Compras pessoais', type: 'outcome', is_active: true }
  ] });
  assert.equal(custom.fields.category, 'Compras pessoais');
  const noCategory = await create('success').analyze(document, { categories: [] });
  assert.equal(noCategory.status, 'partial');
  assert.equal('category' in noCategory.fields, false);
});

test('documento inválido retorna erro sem dados reconhecidos', async () => {
  const result = await create('success').analyze({ ...document, size: 0 }, context);
  assert.equal(result.status, 'error');
  assert.equal('fields' in result, false);
});

test('cancelamento anterior à análise não retorna dados', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await create('success').analyze(document, context, controller.signal);
  assert.equal(result.status, 'cancelled');
  assert.equal('fields' in result, false);
});

test('análise é assíncrona; cancelamento durante espera remove listeners e não retorna dados', async () => {
  const controller = new AbortController();
  let settled = false;
  const pending = create('success', 1000).analyze(document, context, controller.signal);
  pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort();
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal('fields' in result, false);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('conclusão normal também remove listeners de cancelamento', async () => {
  const controller = new AbortController();
  await create('success').analyze(document, context, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('fachada usa cenário de desenvolvimento e ignora cenário de erro em produção', async () => {
  const config = { receiptMockConfig: { scenario: 'error', delayMs: 0 } };
  const optionsReceived = [];
  const dependencies = {
    '../constants/receiptMockConfig': config,
    './receiptMockService': {
      createReceiptMockService(options) {
        optionsReceived.push(options);
        return mockModule.createReceiptMockService({ ...options, delayMs: 0 });
      }
    }
  };
  const development = loadService('src/services/receiptAnalysisService.ts', dependencies, { __DEV__: true });
  const production = loadService('src/services/receiptAnalysisService.ts', dependencies, { __DEV__: false });
  assert.equal((await development.receiptAnalysisService.analyze(document, context)).status, 'error');
  assert.equal((await production.receiptAnalysisService.analyze(document, context)).status, 'success');
  assert.equal(optionsReceived[1].delayMs, 1200);
});
