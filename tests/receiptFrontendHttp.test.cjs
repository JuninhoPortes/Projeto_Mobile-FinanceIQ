const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const express = require('../financeiq-api/node_modules/express');
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const { createReceiptAnalysisMiddleware } = require('../financeiq-api/src/middleware/receiptAnalysis.ts');
const { image, pdf } = require('./helpers/receiptUploadFixtures.cjs');

test('frontend Web → HTTP multipart real → backend simulado: imagens/PDF, autenticação e resposta validada', async t => {
  const verified = [];
  const app = express();
  app.use('/receipts', createReceiptRoutes(async token => {
    verified.push(token);
    assert.equal(token, 'synthetic-id-token');
    return { uid: 'pilot' };
  }, 'pilot', createReceiptAnalysisMiddleware({ NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'simulated',
    RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_SIMULATION_DELAY_MS: '0' })));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const urls = new Set();
  let uploads = 0;
  const guardedFetch = (url, options) => {
    if (urls.has(url)) {
      assert.equal(options.headers, undefined);
    } else {
      assert.equal(url, baseURL + '/receipts/analyze');
      assert.deepEqual(Object.keys(options.headers), ['Authorization']);
      assert.deepEqual([...options.body.keys()], ['document']);
      uploads++;
    }
    return fetch(url, options);
  };
  const documentService = loadTypeScript('src/services/receiptDocumentService.ts');
  const web = loadTypeScript('src/services/receiptMultipartService.web.ts', { './receiptDocumentService': documentService }, { FormData, fetch: guardedFetch });
  const parser = loadTypeScript('src/services/receiptBackendResponseService.ts', {}, { Date });
  const auth = { currentUser: { getIdToken: async () => 'synthetic-id-token' } };
  const { receiptBackendService } = loadTypeScript('src/services/receiptBackendService.ts', {
    '../../firebaseConfig': { auth }, './api': { api: { defaults: { baseURL } } },
    './receiptDocumentService': documentService, './receiptMultipartService': web,
    './receiptBackendResponseService': parser
  }, { URL, fetch: guardedFetch });
  for (const [bytes, name, mimeType] of [[await image(), 'synthetic.png', 'image/png'],
    [await image('jpeg'), 'synthetic.jpg', 'image/jpeg'], [pdf(), 'synthetic.pdf', 'application/pdf']]) {
    const uri = URL.createObjectURL(new Blob([bytes], { type: mimeType })); urls.add(uri);
    try {
      const result = await receiptBackendService.analyze({ uri, name, mimeType, size: bytes.length, source: 'file' }, { categories: [] });
      assert.equal(result.status, 'partial');
      assert.equal(result.isSimulated, true);
      assert.equal(result.provider, 'backend');
      assert.equal(result.fields.amount, 129.9);
      assert.equal('category' in result.fields, false);
      assert.match(result.message, /demonstrativos/);
    } finally { urls.delete(uri); URL.revokeObjectURL(uri); }
  }
  assert.equal(uploads, 3);
  assert.equal(verified.length, 3);
});

test('frontend Web → rota real com OpenAI falso: parcial, rejeição, inconclusão e falhas sem API paga', async t => {
  const OpenAI = require('../financeiq-api/node_modules/openai').default;
  const { response, extraction } = require('./helpers/receiptResponsesMock.cjs');
  const previousMakeRequest = OpenAI.prototype.makeRequest;
  let externalAttempts = 0;
  OpenAI.prototype.makeRequest = () => { externalAttempts++; throw new Error('SDK externo bloqueado'); };
  t.after(() => { OpenAI.prototype.makeRequest = previousMakeRequest; assert.equal(externalAttempts, 0); });
  let reply = () => response(); let calls = 0; let verified = 0;
  const app = express();
  app.use('/receipts', createReceiptRoutes(async token => {
    assert.equal(token, 'offline-only-id-token'); verified++; return { uid: 'pilot' };
  }, 'pilot', createReceiptAnalysisMiddleware({
    NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_LIMITS_MODE: 'local-single-process',
    RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true', RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '1',
    RECEIPT_OPENAI_TIMEOUT_MS: '1000', RECEIPT_PROCESSING_TIMEOUT_MS: '2000',
    RECEIPT_REQUESTS_PER_MINUTE: '100', RECEIPT_REQUESTS_PER_DAY: '100', OPENAI_API_KEY: 'OFFLINE-NOT-A-KEY'
  }, { createOpenAIClient: () => ({ responses: { create(request, options) {
    calls++; assert.equal(options.maxRetries, 0); assert.equal(request.store, false); return reply();
  } } }) })));
  // Não inicia o bootstrap do piloto nem consulta/cria/rearma sua trava operacional.
  const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const bytes = await image(); const uri = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  t.after(() => URL.revokeObjectURL(uri));
  const guardedFetch = (url, options) => {
    assert.ok(url === uri || url === baseURL + '/receipts/analyze', 'Nenhum destino externo permitido');
    return fetch(url, options);
  };
  const documentService = loadTypeScript('src/services/receiptDocumentService.ts');
  const web = loadTypeScript('src/services/receiptMultipartService.web.ts', { './receiptDocumentService': documentService }, { FormData, fetch: guardedFetch });
  const parser = loadTypeScript('src/services/receiptBackendResponseService.ts', {}, { Date });
  const { receiptRealBackendService } = loadTypeScript('src/services/receiptBackendService.ts', {
    '../../firebaseConfig': { auth: { currentUser: { getIdToken: async () => 'offline-only-id-token' } } },
    './api': { api: { defaults: { baseURL } } }, './receiptDocumentService': documentService,
    './receiptMultipartService': web, './receiptBackendResponseService': parser
  }, { URL, fetch: guardedFetch });
  const cases = [
    [() => response(), 'partial', 'partial'],
    [() => { const value = extraction(); value.fields.amount = { valueCents: null, currency: null, certainty: 'missing' }; return response(value); }, 'partial', 'partial'],
    [() => { const value = extraction(); value.document.classification = 'other'; return response(value); }, 'error', 'rejected'],
    [() => { const value = extraction(); value.document.classification = 'unknown'; return response(value); }, 'error', 'inconclusive'],
    [() => { const value = extraction(); for (const name of Object.keys(value.fields)) {
      if (name !== 'identifiedDate') value.fields[name] = name === 'amount' ? { valueCents: null, currency: null, certainty: 'missing' } : { value: null, certainty: 'missing' };
    } return response(value); }, 'error', 'inconclusive'],
    [() => { const value = response(); value.output[0].content[0].text = '{bad'; return value; }, 'error', undefined],
    [() => { throw Object.assign(new Error('PRIVATE-PROVIDER-ERROR'), { status: 429 }); }, 'error', undefined]
  ];
  for (const [nextReply, status, documentStatus] of cases) {
    reply = nextReply;
    const result = await receiptRealBackendService.analyze({ uri, name: 'synthetic.png', mimeType: 'image/png', size: bytes.length, source: 'file' }, { categories: [] });
    assert.equal(result.status, status); assert.equal(result.documentStatus, documentStatus);
    assert.equal(result.isSimulated, false); assert.doesNotMatch(result.message, /demonstrativ|simula|PRIVATE-PROVIDER/);
    if (status === 'error') assert.equal('fields' in result, false);
    else { assert.equal(result.fields.description, 'Compra em Mercado de Teste'); assert.equal('category' in result.fields, false); }
  }
  assert.equal(calls, cases.length); assert.equal(verified, cases.length);
});
