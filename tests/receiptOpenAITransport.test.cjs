const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { once, getEventListeners } = require('node:events');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const OpenAI = require('../financeiq-api/node_modules/openai').default;
const express = require('../financeiq-api/node_modules/express');
const { createReceiptOpenAITransport } = require('../financeiq-api/src/services/receiptOpenAITransport.ts');
const { createReceiptOpenAIAdapter, receiptRealOpenAIConfig } = require('../financeiq-api/src/services/receiptOpenAIAdapter.ts');
const { createReceiptAnalysisMiddleware } = require('../financeiq-api/src/middleware/receiptAnalysis.ts');
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const validation = require('../financeiq-api/src/services/receiptDocumentValidation.ts');
const { response, extraction } = require('./helpers/receiptResponsesMock.cjs');
const { image, pdf, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const { receiptExtractionSchema } = require('../financeiq-api/src/schemas/receiptExtractionSchema.ts');

// Identificador fictício, sem formato/valor de uma credencial real. Nunca lê .env.
const settings = { NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_LIMITS_MODE: 'local-single-process',
  RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true', RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '5',
  RECEIPT_OPENAI_TIMEOUT_MS: '1000', RECEIPT_PROCESSING_TIMEOUT_MS: '2000', OPENAI_API_KEY: 'test-only-not-a-credential' };
const context = { categories: [{ name: 'Alimentação', type: 'outcome', is_active: true }] };
const upload = format => ({ format: format ?? 'png', bytes: Buffer.from('synthetic validated document') });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const aborted = signal => signal.aborted ? Promise.resolve() : new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
const ports = new Set();
const restore = [];
let externalAttempts = 0;
test.before(() => {
  const guard = (target, key, replacement) => {
    const previous = target[key];
    target[key] = replacement ?? (() => { externalAttempts++; throw new Error('External I/O blocked'); });
    restore.push(() => { target[key] = previous; });
  };
  const request = http.request;
  guard(http, 'request', function(options, ...args) {
    if (options.hostname !== '127.0.0.1' || !ports.has(options.port)) { externalAttempts++; throw new Error('External HTTP blocked'); }
    return request.call(this, options, ...args);
  });
  const net = require('node:net');
  const connect = net.Socket.prototype.connect;
  guard(net.Socket.prototype, 'connect', function(...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (!options || (options.host ?? options.hostname) !== '127.0.0.1' || !ports.has(Number(options.port))) {
      externalAttempts++; throw new Error('External socket blocked');
    }
    return connect.apply(this, args);
  });
  guard(http, 'get');
  for (const key of ['request', 'get']) guard(require('node:https'), key);
  guard(globalThis, 'fetch');
  const fs = require('node:fs');
  for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']) guard(fs, key);
  guard(fs.promises, 'writeFile'); guard(fs.promises, 'appendFile');
});
test.after(() => { restore.reverse().forEach(reset => reset()); assert.equal(externalAttempts, 0); });

function fake(reply = () => response()) {
  const calls = [];
  const clients = [];
  const factory = options => {
    clients.push(options);
    return { responses: { create(request, options) {
      calls.push({ request: structuredClone(request), reference: request, options });
      return reply(request, options);
    } } };
  };
  return { calls, clients, factory };
}

function analyze(reply, env = {}, format = 'png') {
  const client = fake(reply);
  const config = { ...settings, ...env };
  const transport = createReceiptOpenAITransport(config, client.factory);
  return createReceiptOpenAIAdapter(transport, { env: config, origin: 'real' }).analyze(upload(format), context);
}

async function endpoint(t, { env = {}, reply = () => response(), factory, onMetrics } = {}) {
  const client = fake(reply);
  const app = express();
  app.use('/receipts', createReceiptRoutes(async token => {
    if (token === 'invalid') throw Object.assign(new Error('secret'), { code: 'auth/invalid-id-token' });
    return { uid: token };
  }, 'pilot,other,a,b,c,d', createReceiptAnalysisMiddleware({ ...settings, ...env }, { createOpenAIClient: factory ?? client.factory, onMetrics })));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; ports.add(port);
  t.after(() => new Promise(resolve => { ports.delete(port); server.closeAllConnections(); server.close(resolve); }));
  const raw = (payload, token = 'pilot', onResponse, query = '') => http.request({
    hostname: '127.0.0.1', port, method: 'POST', path: '/receipts/analyze' + query,
    headers: { 'Content-Type': payload.contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, onResponse);
  const request = (payload, token, query) => new Promise((resolve, reject) => {
    const req = raw(payload, token, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    }, query);
    req.on('error', reject); req.end(payload.bytes);
  });
  return { ...client, request, raw };
}

test('cliente falso recebe JPG/PNG/PDF, modelo preservado, schema estrito e store false', async () => {
  for (const format of ['jpeg', 'png', 'pdf']) {
    const client = fake();
    const transport = createReceiptOpenAITransport(settings, client.factory);
    assert.equal(client.clients.length, 0); // inicialização preguiçosa.
    const value = upload(format);
    const result = await createReceiptOpenAIAdapter(transport, { env: settings, origin: 'real' }).analyze(value, context);
    assert.equal(result.status, 'success');
    assert.equal(result.origin, 'real'); assert.equal(result.analysis.isSimulated, false);
    assert.equal(result.metrics.isSimulated, false);
    assert.doesNotMatch(result.analysis.message, /simula|demonstrativ/i);
    assert.equal(client.calls.length, 1); assert.equal(client.clients.length, 1);
    const { request, reference, options } = client.calls[0];
    assert.equal(request.model, 'gpt-5.4-mini-2026-03-17');
    assert.equal(request.store, false); assert.equal(request.stream, false);
    assert.deepEqual(request.text.format.schema, receiptExtractionSchema);
    assert.equal(request.text.format.strict, true);
    assert.equal(request.max_output_tokens, 2048);
    const part = request.input[0].content[1];
    assert.equal(part.type, format === 'pdf' ? 'input_file' : 'input_image');
    assert.equal(part.file_data ?? part.image_url, `data:${format === 'pdf' ? 'application/pdf' : `image/${format}`};base64,${value.bytes.toString('base64')}`);
    for (const key of ['tools', 'previous_response_id', 'background']) assert.equal(key in request, false);
    assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 1000);
    assert.equal(client.clients[0].maxRetries, 0); assert.equal(client.clients[0].logLevel, 'off');
    assert.equal(client.clients[0].baseURL, 'https://api.openai.com/v1');
    assert.equal(client.clients[0].project, null); assert.equal(client.clients[0].organization, null);
    assert.deepEqual(reference.input, []);
    assert.ok(value.bytes.some(byte => byte !== 0)); // proprietário continua responsável.
  }
});

test('configuração real incompleta falha antes de ler chave ou construir cliente', () => {
  for (const change of [{ RECEIPT_ANALYSIS_MODE: undefined }, { RECEIPT_ANALYSIS_MODE: 'disabled' },
    { RECEIPT_OPENAI_REAL_CALLS_ENABLED: undefined }, { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' },
    { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'TRUE' }, { NODE_ENV: 'production' }, { NODE_ENV: 'test' },
    { RECEIPT_LIMITS_MODE: '' }, { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '' },
    { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '0' }, { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '1.5' },
    { RECEIPT_OPENAI_TIMEOUT_MS: '2000' }, { RECEIPT_OPENAI_MODEL: 'unapproved' }]) {
    const env = { ...settings, ...change };
    Object.defineProperty(env, 'OPENAI_API_KEY', { get() { assert.fail('Não deve ler a chave'); } });
    assert.throws(() => createReceiptOpenAITransport(env, () => assert.fail('Não deve criar cliente')), error => error.code === 'INVALID_CONFIGURATION');
  }
  for (const key of [undefined, '', ' ', 'invalid\nvalue']) {
    assert.throws(() => createReceiptOpenAITransport({ ...settings, OPENAI_API_KEY: key }), error => error.code === 'INVALID_CONFIGURATION');
  }
});

test('adaptador também exige habilitações completas e encerramento para origem real', async () => {
  let calls = 0;
  const transport = { mode: 'real', create() { calls++; return Promise.resolve(response()); }, async whenIdle() {} };
  for (const env of [{}, { ...settings, RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' }, { ...settings, RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '' }]) {
    const result = await createReceiptOpenAIAdapter(transport, { env, origin: 'real' }).analyze(upload(), context);
    assert.equal(result.code, 'INVALID_CONFIGURATION');
    assert.equal(result.analysis.isSimulated, false);
  }
  assert.equal(calls, 0);
  assert.equal(receiptRealOpenAIConfig(settings).timeoutMs, 1000);
});

test('modelo e limite de saída configurados no servidor chegam ao cliente falso', async () => {
  const config = { ...settings, RECEIPT_OPENAI_MODEL: 'gpt-4.1-mini', RECEIPT_OPENAI_MAX_OUTPUT_TOKENS: '1024' };
  const client = fake(() => response(undefined, { model: 'gpt-4.1-mini-2025-04-14' }));
  const transport = createReceiptOpenAITransport(config, client.factory);
  assert.equal((await createReceiptOpenAIAdapter(transport, { env: config, origin: 'real' }).analyze(upload(), context)).status, 'success');
  assert.equal(client.calls[0].request.model, 'gpt-4.1-mini');
  assert.equal(client.calls[0].request.max_output_tokens, 1024);
});

test('resposta real sintética parcial conserva ausências, incertezas e centavos seguros', async () => {
  const value = extraction(); value.fields.amount.certainty = 'uncertain';
  value.fields.category = { value: null, certainty: 'missing' };
  const result = await analyze(() => response(value));
  assert.equal(result.status, 'partial');
  assert.equal('amount' in result.analysis.fields, false);
  assert.equal('category' in result.analysis.fields, false);
  assert.ok(result.assessment.uncertainFields.includes('amount'));
  assert.ok(result.assessment.missingFields.includes('category'));
  assert.equal(result.analysis.isSimulated, false);
});

test('recusas, interrupções, JSON e extrações inválidas não fornecem campos fiscais', async () => {
  const invalidJSON = response(); invalidJSON.output[0].content[0].text = '{broken';
  const refused = response(); refused.output[0].content = [{ type: 'refusal', refusal: 'sensitive content' }];
  const invalidAmount = extraction(); invalidAmount.fields.amount.valueCents = -1;
  const extra = extraction(); extra.origin = 'simulated';
  for (const [raw, code] of [[refused, 'MODEL_REFUSAL'], [response(undefined, { status: 'incomplete' }), 'INCOMPLETE_RESPONSE'],
    [invalidJSON, 'INVALID_JSON'], [response(invalidAmount), 'INVALID_EXTRACTION'], [response(extra), 'INVALID_STRUCTURE'],
    [response(undefined, { model: 'unapproved' }), 'UNEXPECTED_MODEL']]) {
    const result = await analyze(() => raw);
    assert.equal(result.code, code); assert.equal('fields' in result.analysis, false);
    assert.equal(JSON.stringify(result).includes('sensitive content'), false);
  }
});

test('classificação real sintética rejeita incompatíveis e múltiplos documentos', async () => {
  for (const modify of [value => { value.document.classification = 'other'; }, value => { value.document.multipleDocuments = true; }]) {
    const value = extraction(); modify(value);
    const result = await analyze(() => response(value));
    assert.equal(result.status, 'rejected'); assert.equal('fields' in result.analysis, false);
    assert.deepEqual(result.assessment.fields, {});
  }
});

test('origem e métricas reais são determinadas pelo servidor e usage ausente não inventa custo', async () => {
  for (const usage of [undefined, { input_tokens: -1, output_tokens: 1 }]) {
    const result = await analyze(() => response(undefined, { origin: 'simulated', isSimulated: true, usage }));
    assert.equal(result.origin, 'real'); assert.equal(result.analysis.isSimulated, false);
    assert.equal(result.metrics.estimatedCostUsd, null); assert.equal(result.metrics.inputTokens, null);
  }
  const result = await analyze(() => response());
  assert.equal(result.metrics.inputTokens, 3000);
  assert.ok(Math.abs(result.metrics.estimatedCostUsd - 0.003825) < 1e-12);
});

test('erros do cliente são normalizados sem conteúdo sensível ou retries', async () => {
  for (const [error, code] of [[{ status: 401 }, 'PROVIDER_AUTH'], [{ status: 403 }, 'PROVIDER_AUTH'],
    [{ status: 429 }, 'RATE_LIMIT'], [{ status: 500 }, 'UNAVAILABLE'], [{ code: 'ECONNRESET' }, 'UNAVAILABLE'],
    [{ name: 'APIConnectionTimeoutError' }, 'TIMEOUT'], [{ status: 400 }, 'INVALID_REQUEST']]) {
    const client = fake(() => { throw { ...error, message: 'sensitive-document-and-credential' }; });
    const transport = createReceiptOpenAITransport(settings, client.factory);
    const result = await createReceiptOpenAIAdapter(transport, { env: settings, origin: 'real' }).analyze(upload(), context);
    assert.equal(result.code, code); assert.equal(client.calls.length, 1);
    assert.equal(JSON.stringify(result).includes('sensitive-document-and-credential'), false);
    assert.equal('fields' in result.analysis, false);
  }
});

test('SDK oficial com fetch falso faz uma única tentativa em 429/500/rede e recebe o payload', async () => {
  for (const status of [200, 429, 500, 'network']) {
    let attempts = 0;
    const transport = createReceiptOpenAITransport(settings, options => new OpenAI({ ...options, fetch: async (url, init) => {
      attempts++;
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body);
      assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.equal(body.model, 'gpt-5.4-mini-2026-03-17');
      if (status === 'network') throw new Error('Synthetic connection failure');
      return new Response(JSON.stringify(status === 200 ? response() : { error: { type: 'test', code: 'test', message: 'Synthetic provider failure' } }), {
        status, headers: { 'content-type': 'application/json', 'retry-after': '0' }
      });
    } }));
    const result = await createReceiptOpenAIAdapter(transport, { env: settings, origin: 'real' }).analyze(upload(), context);
    assert.equal(attempts, 1);
    assert.equal(result.status, status === 200 ? 'success' : 'error');
  }
});

test('SDK oficial recebe abort com fetch falso e não repete timeout ou cancelamento', async () => {
  for (const cancel of [true, false]) {
    const config = { ...settings, RECEIPT_OPENAI_TIMEOUT_MS: cancel ? '1000' : '20' };
    const controller = new AbortController(); const started = deferred();
    let attempts = 0;
    const transport = createReceiptOpenAITransport(config, options => new OpenAI({ ...options, fetch: async (_url, init) => {
      attempts++; started.resolve(); await aborted(init.signal);
      throw Object.assign(new Error('Synthetic abort'), { name: 'AbortError' });
    } }));
    const pending = createReceiptOpenAIAdapter(transport, { env: config, origin: 'real' }).analyze(upload(), context, controller.signal);
    await started.promise; if (cancel) controller.abort();
    const result = await pending;
    assert.equal(result.code, cancel ? 'CANCELLED' : 'TIMEOUT'); assert.equal(attempts, 1);
    assert.equal('fields' in result.analysis, false); await transport.whenIdle();
  }
});

test('cancelamento anterior não inicializa cliente e propagação remove listeners', async () => {
  const controller = new AbortController(); controller.abort();
  const client = fake(); const transport = createReceiptOpenAITransport(settings, client.factory);
  await assert.rejects(transport.create({}, { signal: controller.signal }), error => error.name === 'AbortError');
  await transport.whenIdle(); assert.equal(client.clients.length, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const active = new AbortController(); const started = deferred();
  const waiting = fake(async (_request, options) => { started.resolve(); await aborted(options.signal); throw new Error('aborted synthetic client'); });
  const real = createReceiptOpenAITransport(settings, waiting.factory);
  const pending = createReceiptOpenAIAdapter(real, { env: settings, origin: 'real' }).analyze(upload(), context, active.signal);
  await started.promise; active.abort();
  const result = await pending;
  assert.equal(result.status, 'cancelled'); assert.equal(result.code, 'CANCELLED');
  assert.equal(waiting.calls[0].options.signal.aborted, true);
  assert.equal(getEventListeners(active.signal, 'abort').length, 0);
});

test('timeout próprio do transporte aborta o cliente sem abandonar sua operação', async () => {
  const config = { ...settings, RECEIPT_OPENAI_TIMEOUT_MS: '10' };
  const client = fake(async (_request, { signal }) => { await aborted(signal); throw new Error('abort'); });
  const transport = createReceiptOpenAITransport(config, client.factory);
  const controller = new AbortController();
  await assert.rejects(transport.create({}, { signal: controller.signal }), error => error.code === 'TIMEOUT');
  await transport.whenIdle(); assert.equal(client.calls.length, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('timeout do adaptador aguarda cliente atrasado e descarta sua resposta', async () => {
  const config = { ...settings, RECEIPT_OPENAI_TIMEOUT_MS: '10' };
  const started = deferred(); const finish = deferred();
  const client = fake(async () => { started.resolve(); await finish.promise; return response(); });
  const transport = createReceiptOpenAITransport(config, client.factory);
  let settled = false;
  const pending = createReceiptOpenAIAdapter(transport, { env: config, origin: 'real' }).analyze(upload(), context).then(value => { settled = true; return value; });
  await started.promise; await aborted(client.calls[0].options.signal); await tick();
  assert.equal(settled, false);
  assert.notDeepEqual(client.calls[0].reference.input, []);
  finish.resolve(); const result = await pending;
  assert.equal(result.code, 'TIMEOUT'); assert.equal('fields' in result.analysis, false);
  assert.deepEqual(client.calls[0].reference.input, []);
  await transport.whenIdle();
});

test('HTTP real sintético reutiliza validação binária, autenticação, quotas e telemetria segura', async t => {
  const metrics = [];
  const endpointValue = await endpoint(t, { env: { RECEIPT_REQUESTS_PER_DAY: '3' }, onMetrics: value => metrics.push(value) });
  const png = await image();
  for (const [token, status] of [[null, 401], ['invalid', 401], ['unauthorized', 403]]) {
    assert.equal((await endpointValue.request(multipart([{ bytes: png }]), token)).status, status);
  }
  assert.equal(endpointValue.calls.length, 0);
  for (const file of [{ bytes: png }, { bytes: await image('jpeg'), name: 'test.jpg', mime: 'image/jpeg' }, { bytes: pdf(), name: 'test.pdf', mime: 'application/pdf' }]) {
    const result = await endpointValue.request(multipart([file]), 'pilot', '?mode=simulated&isSimulated=true');
    assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false);
    assert.equal(result.body.status, 'partial'); // contexto da rota não inventa categorias.
    assert.equal('category' in result.body.fields, false);
    assert.equal(result.body.fields.amount, 129.9);
    assert.doesNotMatch(result.body.message, /simula|demonstrativ/i);
    for (const key of ['metrics', 'origin', 'code']) assert.equal(key in result.body, false);
  }
  assert.equal((await endpointValue.request(multipart([{ bytes: png }]))).status, 429);
  assert.equal(endpointValue.calls.length, 3);
  assert.equal(metrics.length, 3); assert.ok(metrics.every(value => value.isSimulated === false));
  assert.equal(JSON.stringify(metrics).includes('Mercado'), false);
  assert.equal(JSON.stringify(metrics).includes(settings.OPENAI_API_KEY), false);
});

test('HTTP bloqueia configurações incompletas e não cria cliente ou fallback', async t => {
  for (const env of [{ RECEIPT_OPENAI_REAL_CALLS_ENABLED: undefined }, { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' },
    { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '' }, { OPENAI_API_KEY: '' }, { RECEIPT_OPENAI_TIMEOUT_MS: '2000' }, { NODE_ENV: 'production' }]) {
    const value = await endpoint(t, { env, factory: () => assert.fail('Configuração bloqueada não pode inicializar SDK') });
    const result = await value.request(multipart([{ bytes: await image() }]));
    assert.equal(result.status, 503); assert.equal(result.body.code, 'RECEIPT_ANALYSIS_UNAVAILABLE');
    assert.equal('fields' in result.body, false);
  }
});

test('falhas reais sintéticas na rota não expõem detalhes nem produzem dados de fallback', async t => {
  const png = await image();
  const refusal = response(); refusal.output[0].content = [{ type: 'refusal', refusal: 'private synthetic content' }];
  for (const [reply, status, code] of [
    [() => { throw { status: 401, message: 'private synthetic content' }; }, 503, 'PROVIDER_AUTH'],
    [() => { throw { status: 429 }; }, 429, 'RATE_LIMIT'],
    [() => { throw { code: 'ECONNRESET' }; }, 503, 'UNAVAILABLE'],
    [() => refusal, 503, 'MODEL_REFUSAL'],
    [() => response(undefined, { status: 'incomplete' }), 503, 'INCOMPLETE_RESPONSE']
  ]) {
    const value = await endpoint(t, { reply });
    const result = await value.request(multipart([{ bytes: png }]));
    assert.equal(result.status, status); assert.equal(result.body.code, code);
    assert.equal(result.body.isSimulated, false); assert.equal('fields' in result.body, false);
    assert.doesNotMatch(JSON.stringify(result.body), /private synthetic content/i);
    assert.doesNotMatch(result.body.message, /demonstrativ|simula/i);
    assert.equal(value.calls.length, 1);
  }
});

test('disabled e simulated preservam comportamento e não leem a chave nem inicializam SDK', async t => {
  for (const [mode, status] of [['disabled', 501], ['simulated', 200]]) {
    const env = { ...settings, RECEIPT_ANALYSIS_MODE: mode, RECEIPT_SIMULATION_DELAY_MS: '0' };
    Object.defineProperty(env, 'OPENAI_API_KEY', { enumerable: true, get() { assert.fail('Não deve ler chave'); } });
    const handler = createReceiptAnalysisMiddleware(env, { createOpenAIClient: () => assert.fail('Não deve criar SDK') });
    // Verificação HTTP dos modos anteriores também está nas 388 regressões existentes.
    assert.equal(typeof handler, 'function');
    const value = await endpoint(t, { env: { RECEIPT_ANALYSIS_MODE: mode, RECEIPT_SIMULATION_DELAY_MS: '0' } });
    const result = await value.request(multipart([{ bytes: await image() }]));
    assert.equal(result.status, status); assert.equal(value.clients.length, 0);
    if (mode === 'simulated') { assert.equal(result.body.isSimulated, true); assert.match(result.body.message, /Dados demonstrativos/); }
  }
});

test('documentos corrompidos, multipart inesperado e PDF excessivo não iniciam cliente real', async t => {
  const value = await endpoint(t);
  const png = await image();
  for (const [payload, status] of [[multipart([{ bytes: png.subarray(0, png.length - 10) }]), 422],
    [multipart([{ bytes: png }], [['origin', 'simulated']]), 400], [multipart([{ bytes: pdf(4), name: 'test.pdf', mime: 'application/pdf' }]), 422]]) {
    assert.equal((await value.request(payload)).status, status);
  }
  assert.equal(value.clients.length, 0);
});

test('HTTP mantém bytes e concorrência até o cliente confirmar encerramento após timeout', async t => {
  const original = validation.validateReceiptDocument;
  let bytes;
  validation.validateReceiptDocument = async (upload, ...args) => { bytes = upload.bytes; return original(upload, ...args); };
  t.after(() => { validation.validateReceiptDocument = original; });
  const finish = deferred(); const started = deferred();
  t.after(() => { finish.resolve(); });
  const value = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '10', RECEIPT_PROCESSING_TIMEOUT_MS: '500' },
    reply: async () => { started.resolve(); await finish.promise; return response(); } });
  const payload = multipart([{ bytes: await image() }]);
  let responded = false;
  const pending = value.request(payload).then(result => { responded = true; return result; });
  await started.promise; await aborted(value.calls[0].options.signal); await tick();
  assert.equal(responded, false); assert.ok(bytes.some(byte => byte !== 0));
  assert.equal((await value.request(payload)).status, 429);
  finish.resolve();
  assert.equal((await pending).status, 504); assert.ok(bytes.every(byte => byte === 0));
  assert.equal((await value.request(payload)).status, 200);
});

test('desconexão HTTP aborta o cliente, aguarda limpeza e impede resposta tardia', async t => {
  const started = deferred(); const cancelled = deferred(); const cleanup = deferred();
  t.after(() => { cleanup.resolve(); });
  const value = await endpoint(t, { reply: async (_request, { signal }) => {
    started.resolve(); await aborted(signal); cancelled.resolve(); await cleanup.promise; return response();
  } });
  const payload = multipart([{ bytes: await image() }]);
  let responses = 0;
  const req = value.raw(payload, 'pilot', res => { responses++; res.resume(); });
  req.on('error', () => {}); req.end(payload.bytes);
  await started.promise; req.destroy(); await cancelled.promise;
  assert.equal((await value.request(payload)).status, 429);
  cleanup.resolve(); await tick(); await tick();
  assert.equal(responses, 0);
});

test('solicitações concorrentes isolam clientes, payloads, respostas e concorrência global', async t => {
  const started = [deferred(), deferred()]; const finish = [deferred(), deferred()];
  t.after(() => { finish.forEach(value => value.resolve()); });
  let index = 0;
  const value = await endpoint(t, { env: { RECEIPT_GLOBAL_CONCURRENCY: '2' }, reply: async () => {
    const current = index++; started[current].resolve(); await finish[current].promise;
    const document = extraction(); document.fields.description.value = `Synthetic ${current}`; return response(document);
  } });
  const payload = multipart([{ bytes: await image() }]);
  const requests = ['pilot', 'other'].map(uid => value.request(payload, uid));
  await Promise.all(started.map(value => value.promise));
  assert.equal(value.clients.length, 2); assert.notEqual(value.calls[0].reference, value.calls[1].reference);
  assert.equal((await value.request(payload, 'a')).status, 429);
  finish.forEach(value => value.resolve());
  const results = await Promise.all(requests);
  assert.deepEqual(results.map(value => value.body.fields.description).sort(), ['Synthetic 0', 'Synthetic 1']);
  assert.ok(results.every(value => value.body.isSimulated === false));
});
