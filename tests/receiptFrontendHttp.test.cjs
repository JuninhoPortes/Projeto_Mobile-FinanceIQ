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
