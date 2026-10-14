const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { once } = require('node:events');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const express = require('../financeiq-api/node_modules/express');
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const { createReceiptAnalysisMiddleware } = require('../financeiq-api/src/middleware/receiptAnalysis.ts');
const { createReceiptOpenAIAdapter } = require('../financeiq-api/src/services/receiptOpenAIAdapter.ts');
const simulationTransport = require('../financeiq-api/src/services/receiptSimulatedTransport.ts');
const { simulatedReceiptResponse } = require('../financeiq-api/src/services/receiptSimulation.ts');
const validation = require('../financeiq-api/src/services/receiptDocumentValidation.ts');
const { prepareReceiptFormPatch } = require('./helpers/receiptTestRuntime.cjs').loadTypeScript('src/services/receiptFormService.ts');
const { image, pdf, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const { response, extraction } = require('./helpers/receiptResponsesMock.cjs');
const development = { NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'simulated', RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_SIMULATION_DELAY_MS: '0' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const allowedPorts = new Set();
const restore = [];
let externalAttempts = 0;
function guard(target, key, replacement) {
  const previous = target[key];
  target[key] = replacement ?? (() => { externalAttempts++; throw new Error('Unexpected external I/O'); });
  restore.push(() => { target[key] = previous; });
}
test.before(() => {
  const request = http.request;
  guard(http, 'request', function(options, ...args) {
    if (options.hostname !== '127.0.0.1' || !allowedPorts.has(options.port)) { externalAttempts++; throw new Error('External request blocked'); }
    return request.call(this, options, ...args);
  });
  guard(http, 'get'); guard(https, 'request'); guard(https, 'get'); guard(globalThis, 'fetch');
  const fs = require('node:fs');
  for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']) guard(fs, key);
  guard(fs.promises, 'writeFile'); guard(fs.promises, 'appendFile');
});
test.after(() => { restore.reverse().forEach(reset => reset()); assert.equal(externalAttempts, 0); });

async function endpoint(t, settings = {}) {
  const app = express();
  app.use('/receipts', createReceiptRoutes(async token => {
    if (token === 'invalid') throw Object.assign(new Error('secret'), { code: 'auth/invalid-id-token' });
    return { uid: token };
  }, 'pilot,other,a,b,c,d', createReceiptAnalysisMiddleware({ ...development, ...settings })));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  allowedPorts.add(port);
  t.after(() => new Promise(resolve => { allowedPorts.delete(port); server.closeAllConnections(); server.close(resolve); }));
  const raw = (payload, token = 'pilot', onResponse, extraPath = '') => http.request({
    hostname: '127.0.0.1', port, path: `/receipts/analyze${extraPath}`, method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': payload.contentType }
  }, onResponse);
  const request = (payload, token = 'pilot', extraPath = '') => new Promise((resolve, reject) => {
    const req = raw(payload, token, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    }, extraPath);
    req.on('error', reject); req.end(payload.bytes);
  });
  return { request, raw, server };
}

test('modo desabilitado e configuração ausente preservam 501 após upload válido', async t => {
  for (const mode of ['disabled', undefined]) {
    const { request } = await endpoint(t, { RECEIPT_ANALYSIS_MODE: mode });
    const result = await request(multipart([{ bytes: await image() }]));
    assert.equal(result.status, 501);
    assert.equal(result.body.code, 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED');
    assert.equal('fields' in result.body, false);
  }
});

test('simulação é explícita e bloqueada fora de development, em produção e para modo real', async t => {
  for (const settings of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { NODE_ENV: undefined }, { RECEIPT_ANALYSIS_MODE: 'real' }, { RECEIPT_SIMULATION_SCENARIO: 'unknown' }, { RECEIPT_SIMULATION_DELAY_MS: '6000' }]) {
    const { request } = await endpoint(t, settings);
    assert.equal((await request(multipart([{ bytes: await image() }]))).status, 503);
  }
});

test('simulação permanece bloqueada sem os controles locais de upload', async t => {
  const { request } = await endpoint(t, { RECEIPT_LIMITS_MODE: '' });
  const result = await request(multipart([{ bytes: await image() }]));
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'UPLOAD_CONTROLS_UNAVAILABLE');
});

test('PNG/JPEG/PDF chegam ao adaptador e retornam dados explicitamente demonstrativos', async t => {
  const { request } = await endpoint(t);
  for (const file of [
    { bytes: await image(), name: 'synthetic.png', mime: 'image/png' },
    { bytes: await image('jpeg'), name: 'synthetic.jpg', mime: 'image/jpeg' },
    { bytes: pdf(), name: 'synthetic.pdf', mime: 'application/pdf' }
  ]) {
    const result = await request(multipart([file]));
    assert.equal(result.status, 200);
    assert.equal(result.body.provider, 'backend');
    assert.equal(result.body.isSimulated, true);
    assert.equal('code' in result.body, false);
    assert.match(result.body.message, /não extraídos do documento/);
    assert.match(result.body.fields.description, /SIMULAÇÃO/);
    assert.equal(result.body.documentStatus, 'partial');
    assert.equal(result.body.status, 'partial');
    assert.equal(result.body.fields.amount, 129.9);
    assert.equal('category' in result.body.fields, false);
    assert.equal('identifiedDate' in result.body.fields, false);
    assert.equal('metrics' in result.body, false);
  }
});

test('sucesso completo do transporte promovido exige contexto de categorias existente', async () => {
  const context = { categories: [{ name: 'Categoria de teste existente', type: 'outcome', is_active: true }] };
  const transport = simulationTransport.createSimulatedReceiptTransport(() => simulatedReceiptResponse('success', context));
  const result = await createReceiptOpenAIAdapter(transport).analyze({ bytes: Buffer.from('synthetic validated document'), format: 'png' }, context);
  await transport.whenIdle();
  assert.equal(result.status, 'success');
  assert.equal(result.analysis.fields.category, context.categories[0].name);
  assert.equal(result.analysis.isSimulated, true);
});

test('leitura parcial omite total e preserva campos não retornados no patch compatível', async t => {
  const { request } = await endpoint(t, { RECEIPT_SIMULATION_SCENARIO: 'partial' });
  const result = await request(multipart([{ bytes: await image() }]));
  assert.equal(result.status, 200);
  assert.equal(result.body.isSimulated, true);
  assert.equal('code' in result.body, false);
  assert.equal(result.body.documentStatus, 'partial');
  assert.equal('amount' in result.body.fields, false);
  const patch = prepareReceiptFormPatch(result.body, { type: 'outcome', category: 'Alimentação' }, [{ name: 'Alimentação', type: 'outcome', is_active: true }]);
  assert.equal('amount' in patch, false);
  assert.equal('category' in patch, false);
  assert.equal('date' in patch, false);
  assert.equal('period_month' in patch, false);
});

test('HTTP omite campos incertos tanto dos dados aplicáveis quanto da avaliação', async t => {
  const originalCreate = simulationTransport.createSimulatedReceiptTransport;
  const value = extraction();
  for (const field of ['amount', 'type', 'category', 'identifiedDate']) value.fields[field].certainty = 'uncertain';
  simulationTransport.createSimulatedReceiptTransport = () => originalCreate(() => response(value));
  t.after(() => { simulationTransport.createSimulatedReceiptTransport = originalCreate; });
  const { request } = await endpoint(t);
  const result = await request(multipart([{ bytes: await image() }]));
  assert.equal(result.status, 200);
  assert.equal(result.body.isSimulated, true);
  assert.equal(result.body.status, 'partial');
  assert.equal(result.body.documentStatus, 'partial');
  assert.equal('code' in result.body, false);
  for (const field of ['amount', 'type', 'category', 'identifiedDate']) {
    assert.equal(field in result.body.fields, false);
    assert.equal(field in result.body.assessment.fields, false);
    assert.ok(result.body.assessment.uncertainFields.includes(field));
  }
});

test('documentos rejeitados e inconclusivos não retornam campos aplicáveis', async t => {
  for (const [scenario, expected] of [['rejected', 'rejected'], ['unreadable', 'inconclusive']]) {
    const { request } = await endpoint(t, { RECEIPT_SIMULATION_SCENARIO: scenario });
    const result = await request(multipart([{ bytes: await image() }]));
    assert.equal(result.status, 200);
    assert.equal(result.body.documentStatus, expected);
    assert.equal(result.body.status, 'error');
    assert.equal(result.body.isSimulated, true);
    assert.equal('fields' in result.body, false);
    assert.deepEqual(result.body.assessment.fields, {});
  }
});

test('falhas simuladas não fornecem dados financeiros nem fallback', async t => {
  for (const [scenario, expected] of [['error', 503], ['timeout', 504]]) {
    const { request } = await endpoint(t, { RECEIPT_SIMULATION_SCENARIO: scenario });
    const result = await request(multipart([{ bytes: await image() }]));
    assert.equal(result.status, expected);
    assert.equal(result.body.error, true);
    assert.equal(result.body.isSimulated, true);
    assert.equal('fields' in result.body, false);
    assert.equal('amount' in result.body, false);
  }
});

test('401/403 permanecem obrigatórios mesmo com modo simulado habilitado', async t => {
  const { request } = await endpoint(t);
  const payload = multipart([{ bytes: await image() }]);
  assert.equal((await request(payload, null)).status, 401);
  assert.equal((await request(payload, 'invalid')).status, 401);
  assert.equal((await request(payload, 'unauthorized')).status, 403);
});

test('query e campos de identidade não selecionam cenários nem autorizam UID', async t => {
  const { request } = await endpoint(t);
  const file = { bytes: await image() };
  assert.equal((await request(multipart([file]), 'unauthorized', '?userId=pilot&scenario=success')).status, 403);
  assert.equal((await request(multipart([file], [['userId', 'pilot']]))).status, 400);
  const result = await request(multipart([file]), 'pilot', '?scenario=rejected&model=other');
  assert.equal(result.body.documentStatus, 'partial');
});

test('corrupção, tamanho e páginas continuam validados antes da interpretação', async t => {
  const { request } = await endpoint(t);
  const png = await image();
  assert.equal((await request(multipart([{ bytes: png.subarray(0, png.length - 10) }]))).status, 422);
  assert.equal((await request(multipart([{ bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }]))).status, 413);
  assert.equal((await request(multipart([{ bytes: pdf(4), name: 'synthetic.pdf', mime: 'application/pdf' }]))).status, 422);
});

test('quota continua ativa com respostas simuladas', async t => {
  const { request } = await endpoint(t, { RECEIPT_REQUESTS_PER_DAY: '1' });
  const payload = multipart([{ bytes: await image() }]);
  assert.equal((await request(payload)).status, 200);
  assert.equal((await request(payload)).status, 429);
});

test('timeout do adaptador cancela simulação e libera recursos para nova operação', async t => {
  const { request } = await endpoint(t, { RECEIPT_SIMULATION_DELAY_MS: '500', RECEIPT_OPENAI_TIMEOUT_MS: '10' });
  const payload = multipart([{ bytes: await image() }]);
  assert.equal((await request(payload)).status, 504);
  assert.equal((await request(payload)).status, 504); // não 429 por reserva vazada.
});

test('prazo do consumidor também cancela o transporte e preserva liberação', async t => {
  const { request } = await endpoint(t, { RECEIPT_SIMULATION_DELAY_MS: '500', RECEIPT_PROCESSING_TIMEOUT_MS: '10' });
  const payload = multipart([{ bytes: await image() }]);
  assert.equal((await request(payload)).status, 504);
  assert.equal((await request(payload)).status, 504);
});

test('whenIdle não confirma término antes de um transporte atrasado assentar', async () => {
  const done = deferred();
  const started = deferred();
  const transport = simulationTransport.createSimulatedReceiptTransport(async () => { started.resolve(); await done.promise; return response(); });
  const pending = createReceiptOpenAIAdapter(transport, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '10' } }).analyze({ bytes: Buffer.from('synthetic'), format: 'png' }, { categories: [] });
  await started.promise;
  assert.equal((await pending).code, 'TIMEOUT');
  let idle = false;
  const idlePromise = transport.whenIdle().then(() => { idle = true; });
  await tick(); assert.equal(idle, false);
  done.resolve(); await idlePromise;
  assert.equal(idle, true);
});

test('ponte HTTP aguarda transporte encerrar antes de descartar buffer ou responder', async t => {
  const originalCreate = simulationTransport.createSimulatedReceiptTransport;
  const originalValidate = validation.validateReceiptDocument;
  const started = deferred(); const done = deferred();
  let bytes;
  validation.validateReceiptDocument = async (upload, ...args) => { bytes = upload.bytes; return originalValidate(upload, ...args); };
  simulationTransport.createSimulatedReceiptTransport = () => originalCreate(async () => { started.resolve(); await done.promise; return response(); });
  t.after(() => { simulationTransport.createSimulatedReceiptTransport = originalCreate; validation.validateReceiptDocument = originalValidate; done.resolve(); });
  const { request } = await endpoint(t, { RECEIPT_OPENAI_TIMEOUT_MS: '10' });
  const payload = multipart([{ bytes: await image() }]);
  let responded = false;
  const pending = request(payload).then(result => { responded = true; return result; });
  await started.promise;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(responded, false);
  assert.ok(bytes.some(byte => byte !== 0));
  assert.equal((await request(payload)).status, 429);
  done.resolve();
  assert.equal((await pending).status, 504);
  assert.ok(bytes.every(byte => byte === 0));
});

test('desconexão durante simulação aborta o transporte sem resposta tardia', async t => {
  const originalCreate = simulationTransport.createSimulatedReceiptTransport;
  const started = deferred(); const stopped = deferred();
  simulationTransport.createSimulatedReceiptTransport = reply => originalCreate(async (request, options) => {
    started.resolve();
    try { return await reply(request, options); } finally { stopped.resolve(); }
  });
  t.after(() => { simulationTransport.createSimulatedReceiptTransport = originalCreate; });
  const { raw, request } = await endpoint(t, { RECEIPT_SIMULATION_DELAY_MS: '1000' });
  const payload = multipart([{ bytes: await image() }]);
  let responses = 0;
  const req = raw(payload, 'pilot', res => { responses++; res.resume(); });
  req.on('error', () => {}); req.end(payload.bytes);
  await started.promise; req.destroy();
  await stopped.promise; await tick();
  assert.equal(responses, 0);
  const result = await request(payload, 'other');
  assert.equal(result.status, 200);
});

test('resultados e transportes são isolados entre requisições concorrentes', async t => {
  const { request } = await endpoint(t, { RECEIPT_SIMULATION_DELAY_MS: '30' });
  const payload = multipart([{ bytes: await image() }]);
  const results = await Promise.all(['pilot', 'other'].map(token => request(payload, token)));
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.ok(results.every(result => result.body.isSimulated && result.body.fields.amount === 129.9));
});
