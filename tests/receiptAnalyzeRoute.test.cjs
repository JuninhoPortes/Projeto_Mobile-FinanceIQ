const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { once, getEventListeners } = require('node:events');
const { createHash } = require('node:crypto');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const express = require('../financeiq-api/node_modules/express');
const OpenAI = require('../financeiq-api/node_modules/openai').default;
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const { createReceiptAnalysisMiddleware } = require('../financeiq-api/src/middleware/receiptAnalysis.ts');
const validation = require('../financeiq-api/src/services/receiptDocumentValidation.ts');
const scope = require('../financeiq-api/src/services/receiptDocumentScope.ts');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const { image, pdf, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const { response, extraction } = require('./helpers/receiptResponsesMock.cjs');

// Sentinela local, sem formato/valor de credencial. SDK real e rede são bloqueados
// independentemente da fábrica falsa: perder a injeção faz a suíte falhar.
const sentinel = 'OFFLINE-CLIENT-ONLY';
const realSettings = {
  NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_LIMITS_MODE: 'local-single-process',
  RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true', RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '1',
  RECEIPT_OPENAI_TIMEOUT_MS: '2000', RECEIPT_PROCESSING_TIMEOUT_MS: '4000',
  RECEIPT_REQUESTS_PER_MINUTE: '100', RECEIPT_REQUESTS_PER_DAY: '100', OPENAI_API_KEY: sentinel
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const aborted = signal => signal.aborted ? Promise.resolve() : new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
const ports = new Set();
const restore = [];
const observed = { uploads: [], scopes: [], workers: [], blockedIO: 0 };

test.before(() => {
  const replace = (target, key, value) => {
    const previous = target[key]; target[key] = value;
    restore.push(() => { target[key] = previous; }); return previous;
  };
  const deny = () => { observed.blockedIO++; throw new Error('External I/O prohibited'); };
  const request = http.request;
  replace(http, 'request', function(options, ...args) {
    if (options.hostname !== '127.0.0.1' || !ports.has(options.port)) return deny();
    return request.call(this, options, ...args);
  });
  replace(http, 'get', deny);
  for (const key of ['request', 'get']) replace(require('node:https'), key, deny);
  replace(globalThis, 'fetch', deny);
  replace(OpenAI.prototype, 'makeRequest', deny);
  replace(require('node:tls'), 'connect', deny);
  const net = require('node:net');
  const connect = net.Socket.prototype.connect;
  replace(net.Socket.prototype, 'connect', function(...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (!options || (options.host ?? options.hostname) !== '127.0.0.1' || !ports.has(Number(options.port))) return deny();
    return connect.apply(this, args);
  });
  const fs = require('node:fs');
  for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']) replace(fs, key, deny);
  replace(fs.promises, 'writeFile', deny); replace(fs.promises, 'appendFile', deny);

  // Parsers reais em processos reais; apenas acrescentar a guarda de I/O existente.
  const childProcess = require('node:child_process');
  const fork = childProcess.fork;
  replace(childProcess, 'fork', (file, args, options) => {
    assert.equal(file, path.resolve(__dirname, '../financeiq-api/workers/receiptDocumentWorker.cjs'));
    for (const key of ['OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID', 'NODE_OPTIONS']) {
      assert.equal(key in options.env, false);
    }
    const record = { closed: false, messages: [] }; observed.workers.push(record);
    const child = fork(file, args, { ...options, execArgv: [...options.execArgv, '--require', path.resolve(__dirname, 'helpers/receiptWorkerIOGuard.cjs')] });
    child.on('message', message => { record.messages.push({ ok: message.ok, attempts: message.externalIOAttempts }); });
    child.once('close', () => { record.closed = true; });
    return child;
  });
  const validate = validation.validateReceiptDocument;
  replace(validation, 'validateReceiptDocument', async (upload, ...args) => {
    const record = { bytes: upload.bytes, validated: false }; observed.uploads.push(record);
    await validate(upload, ...args); record.validated = true;
  });
  const consume = scope.withReceiptDocument;
  replace(scope, 'withReceiptDocument', async (upload, consumer, signal, timeout) => {
    const record = { bytes: upload.bytes, ended: false, done: deferred() }; observed.scopes.push(record);
    try {
      return await consume(upload, async (document, consumerSignal) => {
        record.document = document; record.signal = consumerSignal;
        return consumer(document, consumerSignal);
      }, signal, timeout);
    } finally { record.ended = true; record.done.resolve(); }
  });
});
test.beforeEach(() => { observed.uploads = []; observed.scopes = []; observed.workers = []; });
test.afterEach(() => {
  assert.equal(observed.blockedIO, 0);
  for (const upload of observed.uploads) assert.ok(upload.bytes.every(byte => byte === 0), 'Buffer deve ser zerado após encerramento');
  for (const record of observed.scopes) {
    assert.equal(record.ended, true);
    assert.throws(() => record.document.readBytes(), error => error.code === 'DOCUMENT_ACCESS_CLOSED');
    assert.equal(getEventListeners(record.signal, 'abort').length, 0);
  }
  for (const worker of observed.workers) {
    assert.equal(worker.closed, true);
    assert.equal(worker.messages.length, 1);
    assert.ok(worker.messages.every(message => message.attempts === 0));
  }
});
test.after(() => { restore.reverse().forEach(reset => reset()); assert.equal(observed.blockedIO, 0); });

// Mesmo serviço Firebase do backend, com SDK e ambiente substituídos apenas no
// loader de testes. Não importa ADC, não usa emulador e não modifica process.env.
function firebase({ env = { FIREBASE_PROJECT_ID: 'offline-project' }, mismatch = false, initError = false } = {}) {
  const calls = { initialized: 0, verified: [] };
  const apps = mismatch ? [{ name: 'financeiq-receipts', options: { projectId: 'another-project' } }] : [];
  const identities = { 'pilot-token': 'pilot', 'other-token': 'other', 'third-token': 'third', 'outside-token': 'outside' };
  const errors = { invalid: 'auth/invalid-id-token', expired: 'auth/id-token-expired', revoked: 'auth/id-token-revoked', disabled: 'auth/user-disabled' };
  const runtime = loadTypeScript('financeiq-api/src/services/firebaseAdminService.ts', {
    'firebase-admin/app': {
      getApps: () => apps, applicationDefault: () => ({ offlineOnly: true }),
      initializeApp(options, name) {
        calls.initialized++;
        if (initError) throw new Error('PRIVATE-SENTINEL');
        const app = { options, name }; apps.push(app); return app;
      }
    },
    'firebase-admin/auth': { getAuth: () => ({ async verifyIdToken(token, checkRevoked) {
      calls.verified.push({ token, checkRevoked });
      if (errors[token] || !identities[token]) throw Object.assign(new Error('PRIVATE-SENTINEL'), { code: errors[token] ?? 'auth/invalid-id-token' });
      return { uid: identities[token] };
    } }) }
  }, { process: { env } });
  return { verify: runtime.createFirebaseTokenVerifier(), calls };
}

async function endpoint(t, { env = {}, auth = firebase(), pilotUIDs = 'pilot,other,third', reply = () => response(), denyKeyRead = false, onMetrics } = {}) {
  const settings = { ...realSettings, ...env };
  if (denyKeyRead) Object.defineProperty(settings, 'OPENAI_API_KEY', { enumerable: true, get() { assert.fail('Chave não deve ser lida'); } });
  const calls = []; const metrics = []; const incoming = [];
  let clients = 0; let active = 0;
  const factory = options => {
    assert.equal(options.apiKey, sentinel); assert.equal(options.maxRetries, 0); assert.equal(options.logLevel, 'off');
    const id = clients++;
    return { responses: { create(request, options) {
      const part = request.input[0].content[1];
      const bytes = Buffer.from((part.file_data ?? part.image_url).split(',')[1], 'base64');
      const call = { id, options, reference: request, hash: digest(bytes), ended: false }; calls.push(call); active++;
      bytes.fill(0);
      assert.equal(request.store, false); assert.equal(request.text.format.strict, true);
      assert.equal(options.maxRetries, 0);
      assert.match(request.input[0].content[0].text, /\[\]/);
      assert.equal(request.input[0].content[0].text.includes('Alimentação'), false);
      return Promise.resolve().then(() => reply(request, options, call)).finally(() => { active--; call.ended = true; });
    } } };
  };
  const app = express();
  app.use((req, res, next) => { incoming.push(req); next(); });
  app.use('/receipts', createReceiptRoutes(auth.verify, pilotUIDs,
    createReceiptAnalysisMiddleware(settings, { createOpenAIClient: factory, onMetrics: value => { metrics.push(value); onMetrics?.(value); } })));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; ports.add(port);
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { ports.delete(port); resolve(); }); }));
  const raw = (payload, { token = 'pilot-token', query = '', headers = {} } = {}, onResponse) => http.request({
    hostname: '127.0.0.1', port, path: '/receipts/analyze' + query, method: 'POST',
    headers: { 'Content-Type': payload.contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
  }, onResponse);
  const request = (payload, options) => new Promise((resolve, reject) => {
    const req = raw(payload, options, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks));
          assert.equal(JSON.stringify(body).includes(sentinel), false);
          assert.equal(JSON.stringify(body).includes('PRIVATE-SENTINEL'), false);
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.end(payload.bytes);
  });
  return { request, raw, calls, metrics, auth, incoming, get clients() { return clients; }, get active() { return active; } };
}
const pngPayload = async () => multipart([{ bytes: await image() }]);
function noFields(result) {
  assert.equal('fields' in result.body, false);
  assert.ok(!result.body.assessment || Object.keys(result.body.assessment.fields).length === 0);
}

test('HTTP completo: autenticação ausente, inválida, expirada, revogada e usuário desabilitado', async t => {
  const route = await endpoint(t); const payload = await pngPayload();
  for (const token of [null, 'invalid', 'expired', 'revoked', 'disabled']) {
    const result = await route.request(payload, { token });
    assert.equal(result.status, 401); assert.equal(result.body.code, 'AUTH_REQUIRED');
    assert.equal(result.headers['cache-control'], 'no-store'); noFields(result);
  }
  assert.equal(route.calls.length, 0); assert.equal(observed.uploads.length, 0);
  const authorized = await route.request(payload);
  assert.equal(authorized.status, 200); assert.equal(authorized.body.isSimulated, false);
  assert.ok(route.auth.calls.verified.every(call => call.checkRevoked === true));
});

test('HTTP completo: configuração Firebase ausente, divergente, emulador e falha de inicialização', async t => {
  const payload = await pngPayload();
  for (const options of [{ env: {} }, { mismatch: true }, { env: { FIREBASE_PROJECT_ID: 'offline-project', FIREBASE_AUTH_EMULATOR_HOST: 'not-used' } }, { initError: true }]) {
    const auth = firebase(options); const route = await endpoint(t, { auth });
    const result = await route.request(payload);
    assert.equal(result.status, 503); assert.equal(result.body.code, 'AUTH_UNAVAILABLE'); noFields(result);
    assert.equal(route.clients, 0); assert.equal(auth.calls.verified.length, 0);
  }
  assert.equal(observed.uploads.length, 0);
});

test('HTTP completo: allowlist nega UID externo, configuração vazia e wildcard', async t => {
  const payload = await pngPayload();
  for (const pilotUIDs of ['', '*', 'pilot-prefix']) {
    const route = await endpoint(t, { pilotUIDs });
    assert.equal((await route.request(payload)).status, 403); assert.equal(route.clients, 0);
  }
  const route = await endpoint(t);
  const result = await route.request(payload, { token: 'outside-token', query: '?uid=pilot&userId=pilot', headers: { 'X-UID': 'pilot' } });
  assert.equal(result.status, 403); assert.equal(result.body.code, 'RECEIPT_ACCESS_DENIED');
  assert.equal(observed.uploads.length, 0);
});

test('HTTP completo: query, cookie, corpo e cabeçalhos duplicados não substituem Bearer', async t => {
  const route = await endpoint(t); const payload = await pngPayload();
  for (const options of [
    { token: null, query: '?token=pilot-token&userId=pilot' },
    { token: null, headers: { Cookie: 'Authorization=Bearer pilot-token', 'X-Authorization': 'Bearer pilot-token' } },
    { token: null, headers: { Authorization: ['Bearer pilot-token', 'Bearer other-token'] } }
  ]) assert.equal((await route.request(payload, options)).status, 401);
  const body = { bytes: Buffer.from('{"token":"pilot-token","uid":"pilot"}'), contentType: 'application/json' };
  assert.equal((await route.request(body, { token: null })).status, 401);
  assert.equal(route.auth.calls.verified.length, 0); assert.equal(route.clients, 0);
});

test('HTTP completo: JPG, PNG e PDFs de uma/três páginas chegam ao transporte após validação real', async t => {
  const route = await endpoint(t);
  for (const file of [{ bytes: await image('jpeg'), name: 'test.jpg', mime: 'image/jpeg' },
    { bytes: await image() }, { bytes: pdf(), name: 'test.pdf', mime: 'application/pdf' },
    { bytes: pdf(3), name: 'test.pdf', mime: 'application/pdf' }]) {
    const result = await route.request(multipart([file]));
    assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false);
    assert.equal(route.calls.at(-1).hash, digest(file.bytes));
    assert.equal(observed.uploads.at(-1).validated, true);
    assert.ok(observed.uploads.at(-1).bytes.every(byte => byte === 0));
  }
  assert.equal(route.clients, 4); assert.equal(route.active, 0);
});

test('HTTP completo: arquivo vazio, extensão/MIME falsos, imagem adulterada e PDFs protegidos/inválidos são barrados', async t => {
  const route = await endpoint(t); const png = await image();
  for (const [file, expected] of [[{ bytes: Buffer.alloc(0) }, 422],
    [{ bytes: png, name: 'test.txt' }, 415], [{ bytes: png, mime: 'application/pdf' }, 415],
    [{ bytes: png, name: 'test.jpg', mime: 'image/jpeg' }, 415], [{ bytes: png.subarray(0, png.length - 8) }, 422],
    [{ bytes: pdf(1, true), name: 'test.pdf', mime: 'application/pdf' }, 422],
    [{ bytes: pdf().subarray(0, 60), name: 'test.pdf', mime: 'application/pdf' }, 422],
    [{ bytes: pdf(4), name: 'test.pdf', mime: 'application/pdf' }, 422]]) {
    const result = await route.request(multipart([file])); assert.equal(result.status, expected); noFields(result);
  }
  assert.equal(route.clients, 0); assert.equal(observed.scopes.length, 0);
});

test('HTTP completo: tamanho, dimensões e pixels acima da política não chegam ao transporte', async t => {
  const route = await endpoint(t, { env: { RECEIPT_MAX_IMAGE_WIDTH: '8', RECEIPT_MAX_IMAGE_PIXELS: '100' } });
  assert.equal((await route.request(await pngPayload())).status, 422);
  const large = multipart([{ bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }]);
  assert.equal((await route.request(large)).status, 413);
  assert.equal(route.clients, 0);
});

test('HTTP completo: multipart malformado, ausente, campo incorreto e campos textuais são barrados', async t => {
  const route = await endpoint(t); const png = await image();
  const normal = multipart([{ bytes: png }]);
  for (const payload of [multipart(), multipart([{ bytes: png, field: 'file' }]),
    multipart([{ bytes: png }], [['origin', 'real']]),
    { ...normal, contentType: 'multipart/form-data' }, { ...normal, bytes: normal.bytes.subarray(0, 60) },
    { bytes: Buffer.from('{}'), contentType: 'application/json' }]) {
    const result = await route.request(payload); assert.equal(result.status, 400); noFields(result);
  }
  assert.equal(route.clients, 0);
});

test('HTTP completo: extração completa preserva centavos/BRL, mas fica parcial sem categorias autorizadas', async t => {
  const route = await endpoint(t); const result = await route.request(await pngPayload());
  assert.equal(result.status, 200); assert.equal(result.body.status, 'partial');
  assert.equal(result.body.documentStatus, 'partial'); assert.equal(result.body.assessment.acceptance, 'accepted');
  assert.equal(result.body.fields.amount, 129.9); assert.equal('category' in result.body.fields, false);
  assert.ok(result.body.assessment.reasonCodes.includes('CATEGORY_NOT_RESOLVED'));
  for (const key of ['origin', 'metrics', 'code', 'source', 'date', 'period_month']) assert.equal(key in result.body, false);
  assert.doesNotMatch(result.body.message, /simula|demonstrativ/i);
});

test('HTTP completo: campos ausentes e incertos são omitidos sem inferir categoria ou tipo', async t => {
  for (const certainty of ['missing', 'uncertain', 'inferred']) {
    const value = extraction();
    value.fields.amount = { valueCents: certainty === 'missing' ? null : 12990, currency: certainty === 'missing' ? null : 'BRL', certainty };
    value.fields.type = { value: certainty === 'missing' ? null : 'outcome', certainty };
    value.fields.category = { value: null, certainty: 'missing' };
    const route = await endpoint(t, { reply: () => response(value) });
    const result = await route.request(await pngPayload());
    assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false);
    assert.equal(result.body.status, 'partial');
    assert.equal(result.body.documentStatus, 'partial'); assert.equal(result.body.assessment.acceptance, 'accepted');
    assert.equal(result.body.fields.description, value.fields.description.value);
    assert.equal('code' in result.body, false);
    for (const key of ['amount', 'type', 'category']) assert.equal(key in result.body.fields, false);
    assert.ok(result.body.assessment[certainty === 'missing' ? 'missingFields' : 'uncertainFields'].includes('amount'));
  }
});

test('HTTP completo: as quatro classificações fiscais explícitas são aceitas sem presumir perspectiva', async t => {
  for (const classification of ['nfe', 'nfce', 'nfse', 'fiscal_receipt']) {
    const value = extraction(); value.document.classification = classification;
    value.fields.type = { value: null, certainty: 'missing' };
    const route = await endpoint(t, { reply: () => response(value) });
    const result = await route.request(await pngPayload());
    assert.equal(result.body.assessment.acceptance, 'accepted'); assert.equal(result.body.status, 'partial');
    assert.equal('type' in result.body.fields, false); assert.equal('category' in result.body.fields, false);
  }
});

test('HTTP completo: documento não fiscal, inconclusivo, ilegível ou múltiplo não fornece campos', async t => {
  for (const [change, status, reason] of [
    [value => { value.document.classification = 'other'; }, 'rejected', 'INCOMPATIBLE_DOCUMENT'],
    [value => { value.document.classification = 'unknown'; }, 'inconclusive', 'UNDETERMINED_DOCUMENT'],
    [value => { value.document.certainty = 'uncertain'; }, 'inconclusive', 'UNDETERMINED_DOCUMENT'],
    [value => { value.document.readability = 'unreadable'; }, 'inconclusive', 'UNREADABLE_DOCUMENT'],
    [value => { value.document.multipleDocuments = true; }, 'rejected', 'MULTIPLE_DOCUMENTS']
  ]) {
    const value = extraction(); change(value);
    const route = await endpoint(t, { reply: () => response(value) }); const result = await route.request(await pngPayload());
    assert.equal(result.status, 200); assert.equal(result.body.documentStatus, status);
    assert.equal(result.body.status, 'error'); assert.ok(result.body.assessment.reasonCodes.includes(reason)); noFields(result);
    assert.equal(result.body.assessment.acceptance, status === 'rejected' ? 'rejected' : 'undetermined');
    assert.equal(result.body.isSimulated, false); assert.equal('code' in result.body, false);
    assert.doesNotMatch(result.body.message, /simula|demonstrativ/i);
    assert.equal(route.metrics.length, 1); assert.equal(route.metrics[0].status, status);
    assert.equal(route.metrics[0].isSimulated, false);
  }
});

test('HTTP completo: classificação aceita sem campos de lançamento seguros permanece inconclusiva', async t => {
  // Casos novos de cobertura; não reproduzem a resposta privada do piloto.
  for (const informationalField of [null, 'merchant', 'identifiedDate']) {
    const value = extraction();
    for (const name of Object.keys(value.fields)) {
      if (name === informationalField) continue;
      value.fields[name] = name === 'amount'
        ? { valueCents: null, currency: null, certainty: 'missing' }
        : { value: null, certainty: 'missing' };
    }
    const route = await endpoint(t, { reply: () => response(value) });
    const result = await route.request(await pngPayload());
    assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false);
    assert.equal(result.body.status, 'error'); assert.equal(result.body.documentStatus, 'inconclusive');
    assert.equal(result.body.assessment.acceptance, 'accepted');
    assert.equal('fields' in result.body, false); assert.equal('code' in result.body, false);
    // Data isolada é apenas informativa; nunca se torna campo de lançamento.
    assert.deepEqual(result.body.assessment.fields, informationalField === 'identifiedDate'
      ? { identifiedDate: value.fields.identifiedDate.value } : {});
    assert.ok(result.body.assessment.missingFields.includes('amount'));
    for (const key of ['date', 'period_month', 'source']) assert.equal(key in result.body, false);
    assert.equal(route.metrics.length, 1); assert.equal(route.metrics[0].status, 'inconclusive');
  }
});

test('HTTP completo: centavos inteiros BRL são convertidos exatamente dentro do teto existente', async t => {
  for (const cents of [1, 199, 100000000]) {
    const value = extraction(); value.fields.amount.valueCents = cents;
    const route = await endpoint(t, { reply: () => response(value) }); const result = await route.request(await pngPayload());
    assert.equal(result.status, 200); assert.equal(result.body.fields.amount, cents / 100);
    assert.equal(Math.round(result.body.fields.amount * 100), cents);
  }
});

test('HTTP completo: valores negativos, zero, fracionários, textuais e acima do teto são rejeitados', async t => {
  for (const cents of [-1, 0, 1.5, '12990', 100000001, Number.MAX_SAFE_INTEGER + 1]) {
    const value = extraction(); value.fields.amount.valueCents = cents;
    const route = await endpoint(t, { reply: () => response(value) }); const result = await route.request(await pngPayload());
    assert.equal(result.status, 503); assert.ok(['INVALID_STRUCTURE', 'INVALID_EXTRACTION'].includes(result.body.code)); noFields(result);
  }
});

test('HTTP completo: moeda estrangeira ou ausente não aplica total nem faz conversão', async t => {
  for (const currency of ['USD', null]) {
    const value = extraction(); value.fields.amount.currency = currency;
    const route = await endpoint(t, { reply: () => response(value) }); const result = await route.request(await pngPayload());
    assert.equal(result.body.status, 'partial'); assert.equal('amount' in result.body.fields, false);
    assert.ok(result.body.assessment.reasonCodes.includes('UNSUPPORTED_OR_UNKNOWN_CURRENCY'));
  }
});

test('HTTP completo: JSON inválido, recusa, resposta incompleta e modelo divergente são rejeitados', async t => {
  const invalid = response(); invalid.output[0].content[0].text = '{broken';
  const refused = response(); refused.output[0].content = [{ type: 'refusal', refusal: 'PRIVATE-SENTINEL' }];
  for (const [raw, code] of [[invalid, 'INVALID_JSON'], [refused, 'MODEL_REFUSAL'],
    [response(undefined, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }), 'INCOMPLETE_RESPONSE'],
    [response(undefined, { model: 'unapproved-model' }), 'UNEXPECTED_MODEL'], [null, 'INVALID_RESPONSE']]) {
    const route = await endpoint(t, { reply: () => raw }); const result = await route.request(await pngPayload());
    assert.equal(result.status, 503); assert.equal(result.body.code, code); noFields(result);
  }
});

test('HTTP completo: resposta semanticamente inconsistente não fornece campos', async t => {
  for (const change of [value => { value.fields.description.value = null; },
    value => { value.fields.identifiedDate.value = '2026-02-30'; },
    value => { value.fields.amount = { valueCents: null, currency: 'BRL', certainty: 'missing' }; }]) {
    const value = extraction(); change(value);
    const route = await endpoint(t, { reply: () => response(value) }); const result = await route.request(await pngPayload());
    assert.equal(result.status, 503); assert.equal(result.body.code, 'INVALID_EXTRACTION'); noFields(result);
  }
});

test('HTTP completo: origem não vem do provedor, query, cabeçalhos ou campos fiscais extras', async t => {
  const route = await endpoint(t, { reply: () => response(undefined, { origin: 'simulated', isSimulated: true, provider: 'mock' }) });
  const result = await route.request(await pngPayload(), { query: '?mode=simulated&origin=simulated&isSimulated=true', headers: { 'X-Receipt-Analysis-Mode': 'simulated' } });
  assert.equal(result.body.isSimulated, false); assert.equal(result.body.provider, 'backend');
  const extra = extraction(); extra.isSimulated = true;
  const invalid = await endpoint(t, { reply: () => response(extra) });
  assert.equal((await invalid.request(await pngPayload())).body.code, 'INVALID_STRUCTURE');
});

test('HTTP completo: disabled e simulated preservam contratos sem ler chave ou criar SDK', async t => {
  for (const mode of [undefined, 'disabled', 'simulated']) {
    const route = await endpoint(t, { env: { RECEIPT_ANALYSIS_MODE: mode, RECEIPT_SIMULATION_DELAY_MS: '0' }, denyKeyRead: true });
    const result = await route.request(await pngPayload(), { query: '?mode=real&enabled=true', headers: { 'X-Receipt-Analysis-Mode': 'real' } });
    assert.equal(result.status, mode === 'simulated' ? 200 : 501); assert.equal(route.clients, 0);
    if (mode === 'simulated') { assert.equal(result.body.isSimulated, true); assert.match(result.body.message, /Dados demonstrativos/); }
    else { assert.equal(result.body.code, 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED'); noFields(result); }
  }
});

test('HTTP completo: real incompleto e produção falham fechados sem fallback', async t => {
  for (const env of [{ RECEIPT_OPENAI_REAL_CALLS_ENABLED: undefined }, { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' },
    { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '' }, { OPENAI_API_KEY: '' }, { RECEIPT_LIMITS_MODE: '' },
    { RECEIPT_OPENAI_TIMEOUT_MS: '4000' }, { NODE_ENV: 'production' }]) {
    const route = await endpoint(t, { env }); const result = await route.request(await pngPayload(), { query: '?mode=simulated&uid=pilot' });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'RECEIPT_ANALYSIS_UNAVAILABLE'); noFields(result);
    assert.equal(route.clients, 0);
  }
  assert.equal(observed.uploads.length, 0);
});

test('HTTP completo: erros de rede/provedor mantêm códigos, confidencialidade e uma única tentativa', async t => {
  for (const [error, status, code] of [[{ status: 401 }, 503, 'PROVIDER_AUTH'], [{ status: 403 }, 503, 'PROVIDER_AUTH'],
    [{ status: 429 }, 429, 'RATE_LIMIT'], [{ status: 500 }, 503, 'UNAVAILABLE'], [{ code: 'ECONNRESET' }, 503, 'UNAVAILABLE']]) {
    const route = await endpoint(t, { reply: () => { throw { ...error, message: 'PRIVATE-SENTINEL' }; } });
    const result = await route.request(await pngPayload());
    assert.equal(result.status, status); assert.equal(result.body.code, code); assert.equal(result.body.isSimulated, false); noFields(result);
    assert.equal(route.calls.length, 1); assert.equal(route.active, 0);
  }
});

test('HTTP completo: usage ausente/inválido e observador com falha não alteram a resposta', async t => {
  for (const usage of [undefined, { input_tokens: -1, output_tokens: 1 }]) {
    const route = await endpoint(t, { reply: () => response(undefined, { usage }), onMetrics: () => { throw new Error('PRIVATE-SENTINEL'); } });
    const result = await route.request(await pngPayload()); assert.equal(result.status, 200);
    assert.equal(route.metrics[0].estimatedCostUsd, null); assert.equal(route.metrics[0].inputTokens, null);
    assert.equal('metrics' in result.body, false); assert.equal('usage' in result.body, false);
    assert.deepEqual(Object.keys(route.metrics[0]).sort(), ['model', 'isSimulated', 'status', 'durationMs', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'estimatedCostUsd'].sort());
  }
});

test('HTTP completo: falha consome quota diária sem reter concorrência ou afetar outro UID', async t => {
  const route = await endpoint(t, { env: { RECEIPT_REQUESTS_PER_DAY: '1' }, reply: () => { throw new Error('PRIVATE-SENTINEL'); } });
  const payload = await pngPayload();
  assert.equal((await route.request(payload)).status, 503); assert.equal(route.active, 0);
  assert.equal((await route.request(payload)).status, 429);
  assert.equal((await route.request(payload, { token: 'other-token' })).status, 503);
  assert.equal(route.calls.length, 2);
});

test('HTTP completo: limite padrão de cinco solicitações por minuto é preservado', async t => {
  const route = await endpoint(t, { env: { RECEIPT_REQUESTS_PER_MINUTE: undefined } }); const payload = await pngPayload();
  for (let index = 0; index < 5; index++) assert.equal((await route.request(payload)).status, 200);
  const limited = await route.request(payload);
  assert.equal(limited.status, 429); assert.equal(limited.body.code, 'RECEIPT_USAGE_LIMIT');
  assert.equal(limited.headers['retry-after'], '60'); assert.equal(route.calls.length, 5);
});

test('HTTP completo: timeout cooperativo aborta, limpa e permite nova operação no mesmo UID', async t => {
  let first = true;
  const route = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '10' }, reply: async (_request, { signal }) => {
    if (!first) return response(); first = false; await aborted(signal); throw new Error('PRIVATE-SENTINEL');
  } });
  const payload = await pngPayload(); const result = await route.request(payload);
  assert.equal(result.status, 504); assert.equal(result.body.code, 'TIMEOUT'); noFields(result);
  assert.equal(route.active, 0); assert.equal(route.calls[0].options.signal.aborted, true);
  assert.deepEqual(route.calls[0].reference.input, []);
  assert.equal((await route.request(payload)).status, 200); assert.equal(route.calls.length, 2);
});

test('HTTP completo: cliente não cooperativo mantém bytes/reserva até terminar e resposta tardia é descartada', async t => {
  const finish = deferred(); const started = deferred(); t.after(() => { finish.resolve(); });
  const route = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '10' }, reply: async () => {
    started.resolve(); await finish.promise; return response();
  } });
  const payload = await pngPayload(); let responded = false;
  const pending = route.request(payload).then(value => { responded = true; return value; });
  await started.promise; await aborted(route.calls[0].options.signal); await tick();
  assert.equal(responded, false); assert.equal(route.active, 1);
  assert.ok(observed.scopes[0].bytes.some(byte => byte !== 0));
  assert.equal((await route.request(payload)).status, 429);
  finish.resolve(); const result = await pending;
  assert.equal(result.status, 504); noFields(result);
  assert.equal(route.active, 0); assert.ok(observed.scopes[0].bytes.every(byte => byte === 0));
  assert.deepEqual(route.calls[0].reference.input, []);
});

test('HTTP completo: desconexão revoga handle, aguarda limpeza e libera reserva sem resposta tardia', async t => {
  const started = deferred(); const cancelled = deferred(); const finish = deferred();
  t.after(() => { finish.resolve(); }); let first = true;
  const route = await endpoint(t, { reply: async (_request, { signal }) => {
    if (!first) return response(); first = false; started.resolve();
    await aborted(signal); cancelled.resolve(); await finish.promise; return response();
  } });
  const payload = await pngPayload(); let responses = 0;
  const req = route.raw(payload, {}, res => { responses++; res.resume(); }); req.on('error', () => {}); req.end(payload.bytes);
  await started.promise; req.destroy(); await cancelled.promise;
  const record = observed.scopes[0];
  assert.throws(() => record.document.readBytes(), error => error.code === 'DOCUMENT_ACCESS_CLOSED');
  assert.ok(record.bytes.some(byte => byte !== 0));
  assert.equal((await route.request(payload)).status, 429);
  finish.resolve(); await record.done.promise; await tick();
  assert.equal(route.active, 0); assert.ok(record.bytes.every(byte => byte === 0));
  assert.equal((await route.request(payload)).status, 200); assert.equal(responses, 0);
});

test('HTTP completo: prazo do consumidor revoga acesso e mantém reserva até limpeza do cliente atrasado', async t => {
  const started = deferred(); const finish = deferred(); t.after(() => { finish.resolve(); });
  let first = true;
  const route = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '10', RECEIPT_PROCESSING_TIMEOUT_MS: '40' }, reply: async () => {
    if (!first) return response(); first = false; started.resolve(); await finish.promise; return response();
  } });
  const payload = await pngPayload(); let responded = false;
  const pending = route.request(payload).then(value => { responded = true; return value; });
  await started.promise; const record = observed.scopes[0]; await aborted(record.signal);
  assert.equal(responded, false); assert.equal(route.active, 1);
  assert.throws(() => record.document.readBytes(), error => error.code === 'DOCUMENT_ACCESS_CLOSED');
  assert.ok(record.bytes.some(byte => byte !== 0));
  assert.equal((await route.request(payload)).status, 429);
  finish.resolve(); const result = await pending;
  assert.equal(result.status, 504); assert.equal(result.body.code, 'DOCUMENT_PROCESSING_CANCELLED_OR_TIMED_OUT'); noFields(result);
  assert.equal(route.active, 0); assert.ok(record.bytes.every(byte => byte === 0));
  assert.equal((await route.request(payload)).status, 200);
});

test('HTTP completo: concorrência global e isolamento de documentos/resultados entre UIDs', async t => {
  const files = [{ bytes: await image() }, { bytes: pdf(3), name: 'test.pdf', mime: 'application/pdf' }];
  const started = [deferred(), deferred()]; const finish = deferred(); t.after(() => { finish.resolve(); });
  let index = 0;
  const expected = new Map(files.map((file, i) => [digest(file.bytes), `Offline document ${i}`]));
  const route = await endpoint(t, { env: { RECEIPT_GLOBAL_CONCURRENCY: '2' }, reply: async (_request, _options, call) => {
    const current = index++; started[current].resolve(); await finish.promise;
    const value = extraction(); value.fields.description.value = expected.get(call.hash); return response(value);
  } });
  const requests = files.map((file, i) => route.request(multipart([file]), { token: i ? 'other-token' : 'pilot-token' }));
  await Promise.all(started.map(value => value.promise));
  assert.equal(route.active, 2); assert.equal(route.clients, 2);
  assert.notEqual(route.calls[0].reference, route.calls[1].reference);
  assert.notEqual(observed.scopes[0].bytes, observed.scopes[1].bytes);
  assert.equal((await route.request(await pngPayload(), { token: 'third-token' })).status, 429);
  finish.resolve(); const results = await Promise.all(requests);
  assert.deepEqual(results.map(value => value.body.fields.description), ['Offline document 0', 'Offline document 1']);
  assert.equal(route.active, 0); assert.equal(route.calls.length, 2);
});
