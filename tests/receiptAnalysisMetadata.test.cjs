const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const ts = require('../financeiq-api/node_modules/typescript');
const { receiptAnalysisMetadata, hasConsistentReceiptAnalysisMetadata } = require('../financeiq-api/src/services/receiptAnalysisMetadata.ts');
const { analyzeReceipt } = require('../financeiq-api/src/controllers/receiptController.ts');
const { validateReceiptExtraction } = require('../financeiq-api/src/services/receiptExtractionValidation.ts');
const { extraction } = require('./helpers/receiptResponsesMock.cjs');

// Esta suíte exercita contratos e controller com dados sintéticos, sem servidor.
let externalAttempts = 0;
const restore = [];
test.before(() => {
  const deny = (target, key) => {
    const previous = target[key];
    target[key] = () => { externalAttempts++; throw new Error('Unexpected external I/O'); };
    restore.push(() => { target[key] = previous; });
  };
  for (const name of ['node:http', 'node:https']) for (const key of ['request', 'get']) deny(require(name), key);
  const net = require('node:net');
  deny(net, 'connect'); deny(net, 'createConnection'); deny(net.Socket.prototype, 'connect');
  deny(globalThis, 'fetch');
  const fs = require('node:fs');
  for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']) deny(fs, key);
  deny(fs.promises, 'writeFile'); deny(fs.promises, 'appendFile');
});
test.after(() => { restore.reverse().forEach(reset => reset()); assert.equal(externalAttempts, 0); });

function result(origin, input = extraction()) {
  const { isSimulated } = receiptAnalysisMetadata(origin);
  const validated = validateReceiptExtraction(input, { categories: [{ name: 'Alimentação', type: 'outcome', is_active: true }] });
  assert.equal(validated.valid, true);
  const { analysis, assessment } = validated;
  return {
    origin, status: assessment.acceptance === 'rejected' ? 'rejected'
      : assessment.acceptance === 'undetermined' || analysis.status === 'error' ? 'inconclusive' : analysis.status,
    analysis: { ...analysis, isSimulated, message: isSimulated ? `Simulação: ${analysis.message}` : analysis.message },
    assessment,
    metrics: { model: 'test-only', isSimulated, status: analysis.status, durationMs: 0,
      inputTokens: null, cachedInputTokens: null, outputTokens: null, estimatedCostUsd: null }
  };
}

function respond(value) {
  const res = {
    locals: { receiptAnalysisResult: value },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  analyzeReceipt({}, res);
  assert.equal('receiptAnalysisResult' in res.locals, false);
  return res;
}

test('contratos TypeScript correlacionam origem, análise e métricas sem relaxar os campos fiscais', () => {
  // Fonte virtual: verifica os tipos de verdade, sem criar arquivos ou emitir JS.
  const virtualFile = path.resolve(__dirname, '../financeiq-api/src/receiptAnalysisContracts.test.ts');
  const source = `
    import type { ReceiptAdapterResult, ReceiptResponsesTransport } from './types/receiptOpenAI';
    const metrics = { model: 'test', status: 'partial' as const, durationMs: 0,
      inputTokens: null, cachedInputTokens: null, outputTokens: null, estimatedCostUsd: null };
    const simulated: ReceiptAdapterResult = { origin: 'simulated', status: 'partial',
      analysis: { provider: 'backend', isSimulated: true, status: 'partial', fields: {}, message: 'Simulação' },
      metrics: { ...metrics, isSimulated: true } };
    const real: ReceiptAdapterResult = { origin: 'real', status: 'partial',
      analysis: { provider: 'backend', isSimulated: false, status: 'partial', fields: {}, message: 'Revisar' },
      metrics: { ...metrics, isSimulated: false } };
    // @ts-expect-error Origem real não aceita indicadores simulados.
    const wrongOrigin: ReceiptAdapterResult = { ...simulated, origin: 'real' };
    // @ts-expect-error Métricas e análise precisam ter a mesma origem.
    const wrongMetrics: ReceiptAdapterResult = { ...real, metrics: simulated.metrics };
    // @ts-expect-error Sucesso continua exigindo todos os campos obrigatórios.
    const missingFields: ReceiptAdapterResult = { ...real, analysis: { ...real.analysis, status: 'success', fields: {} } };
    // @ts-expect-error Valores monetários não podem virar strings.
    const wrongAmount: ReceiptAdapterResult = { ...real, analysis: { ...real.analysis, fields: { amount: '129,90' } } };
    declare const transport: ReceiptResponsesTransport;
    // @ts-expect-error O modo não pode ser reatribuído pelo contrato.
    transport.mode = 'real';
  `;
  const options = { strict: true, skipLibCheck: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => path.resolve(file) === virtualFile
    ? ts.createSourceFile(file, source, options.target, true) : read(file, ...args);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([virtualFile], options, host));
  assert.deepEqual(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
});

test('origens simulada e real possuem indicadores explícitos e imutáveis', () => {
  for (const [origin, isSimulated] of [['simulated', true], ['real', false]]) {
    const metadata = receiptAnalysisMetadata(origin);
    assert.deepEqual(metadata, { origin, isSimulated });
    assert.equal(Object.isFrozen(metadata), true);
    assert.equal(hasConsistentReceiptAnalysisMetadata(result(origin)), true);
  }
  for (const origin of [undefined, null, '', 'live', 'disabled', true, {}]) {
    assert.throws(() => receiptAnalysisMetadata(origin), /Invalid receipt analysis origin/);
  }
});

test('controller representa contratos reais e simulados sem ampliar o envelope HTTP', () => {
  for (const origin of ['simulated', 'real']) {
    const value = result(origin);
    const res = respond(value);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isSimulated, origin === 'simulated');
    assert.equal(res.body.status, 'success');
    assert.deepEqual(res.body.fields, value.analysis.fields);
    assert.deepEqual(res.body.assessment, value.assessment);
    assert.equal(/Simulação|demonstrativos/.test(res.body.message), origin === 'simulated');
    assert.deepEqual(Object.keys(res.body).sort(), ['provider', 'isSimulated', 'status', 'fields', 'message', 'documentStatus', 'assessment'].sort());
  }
});

test('leitura parcial preserva campos ausentes e incertos nas duas origens', () => {
  const input = extraction();
  input.fields.amount = { valueCents: null, currency: null, certainty: 'missing' };
  input.fields.type.certainty = 'uncertain';
  for (const origin of ['simulated', 'real']) {
    const res = respond(result(origin, input));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'partial');
    assert.equal(res.body.isSimulated, origin === 'simulated');
    assert.ok(res.body.assessment.missingFields.includes('amount'));
    assert.ok(res.body.assessment.uncertainFields.includes('type'));
    for (const field of ['amount', 'type', 'category']) assert.equal(field in res.body.fields, false);
  }
});

test('documentos incompatíveis e inconclusivos continuam sem campos aplicáveis', () => {
  for (const origin of ['simulated', 'real']) for (const classification of ['other', 'unknown']) {
    const input = extraction(); input.document.classification = classification;
    const res = respond(result(origin, input));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.documentStatus, classification === 'other' ? 'rejected' : 'inconclusive');
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.isSimulated, origin === 'simulated');
    assert.equal('fields' in res.body, false);
    assert.deepEqual(res.body.assessment.fields, {});
  }
});

test('falhas e cancelamentos preservam códigos HTTP e indicador de origem', () => {
  for (const origin of ['simulated', 'real']) for (const [status, code, expected] of [
    ['error', 'UNAVAILABLE', 503], ['error', 'RATE_LIMIT', 429], ['error', 'TIMEOUT', 504], ['cancelled', 'CANCELLED', 504]
  ]) {
    const value = result(origin);
    value.status = status; value.code = code;
    value.analysis = { provider: 'backend', isSimulated: origin === 'simulated', status: 'error', message: 'Falha de teste' };
    const res = respond(value);
    assert.equal(res.statusCode, expected);
    assert.deepEqual(res.body, { error: true, code, message: 'Falha de teste', isSimulated: origin === 'simulated' });
  }
});

test('controller rejeita metadados ausentes, desconhecidos e contraditórios sem devolver campos', () => {
  for (const origin of ['simulated', 'real']) for (const mutate of [
    value => { delete value.origin; }, value => { value.origin = 'live'; },
    value => { value.origin = origin === 'simulated' ? 'real' : 'simulated'; },
    value => { value.analysis.isSimulated = !value.analysis.isSimulated; },
    value => { value.metrics.isSimulated = !value.metrics.isSimulated; },
    value => { value.analysis.isSimulated = String(value.analysis.isSimulated); },
    value => { value.analysis.provider = 'mock'; }, value => { delete value.metrics; },
    value => { value.analysis = null; }
  ]) {
    const value = result(origin); mutate(value);
    assert.equal(hasConsistentReceiptAnalysisMetadata(value), false);
    const res = respond(value);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'RECEIPT_ANALYSIS_UNAVAILABLE');
    for (const key of ['fields', 'assessment', 'origin', 'metrics', 'isSimulated']) assert.equal(key in res.body, false);
  }
});
