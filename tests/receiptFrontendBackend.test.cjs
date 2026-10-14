const test = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const documentService = loadTypeScript('src/services/receiptDocumentService.ts');
const parser = loadTypeScript('src/services/receiptBackendResponseService.ts', {}, { Date });
const plain = value => JSON.parse(JSON.stringify(value));
const doc = { uri: 'file:///cache/synthetic.png', name: 'synthetic.png', mimeType: 'image/png', size: 100, source: 'file' };
const context = { categories: [{ name: 'Alimentação', type: 'outcome', is_active: true }] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function response(status = 'partial', fields = { description: 'SIMULAÇÃO — compra', amount: 129.9, type: 'outcome' }) {
  return { provider: 'backend', isSimulated: true, status, documentStatus: status, fields,
    assessment: { acceptance: 'accepted', missingFields: [], uncertainFields: [], reasonCodes: [], fields: { ...fields } } };
}

class NativeFormData {
  parts = [];
  append(name, value) { this.parts.push([name, value]); }
}
const multipart = loadTypeScript('src/services/receiptMultipartService.ts', {}, { FormData: NativeFormData });

function fixture(options = {}) {
  const requests = [];
  let tokenCalls = 0;
  const auth = { currentUser: {
    uid: 'test-user',
    getIdToken: async () => { tokenCalls++; return 'synthetic-secret-token'; }
  } };
  if ('user' in options) auth.currentUser = options.user;
  const service = loadTypeScript('src/services/receiptBackendService.ts', {
    '../../firebaseConfig': { auth },
    './api': { api: { defaults: { baseURL: options.baseURL ?? 'https://api.example.invalid' } } },
    './receiptDocumentService': documentService,
    './receiptMultipartService': options.multipart ?? multipart,
    './receiptBackendResponseService': parser
  }, { URL, fetch: async (...args) => {
    requests.push(args);
    if (options.fetch) return options.fetch(...args);
    return { status: options.status ?? 200, json: async () => options.body ?? response() };
  } }).createReceiptBackendService(options.timeoutMs ?? 1000, options.mode);
  return { service, auth, requests, tokenCalls: () => tokenCalls };
}

test('backend obtém ID token pelo usuário Firebase e envia um único document, sem UID, categorias ou Content-Type manual', async () => {
  const f = fixture();
  const result = await f.service.analyze(doc, context);
  assert.equal(result.status, 'partial');
  assert.equal(result.isSimulated, true);
  assert.equal(f.tokenCalls(), 1);
  assert.equal(f.requests.length, 1);
  const [url, request] = f.requests[0];
  assert.equal(url, 'https://api.example.invalid/receipts/analyze');
  assert.equal(request.method, 'POST');
  assert.deepEqual(plain(request.headers), { Authorization: 'Bearer synthetic-secret-token' });
  assert.equal(request.credentials, 'omit');
  assert.equal(request.redirect, 'error');
  assert.deepEqual(plain(request.body.parts), [['document', { uri: doc.uri, name: doc.name, type: doc.mimeType }]]);
  assert.equal(JSON.stringify(result).includes('synthetic-secret-token'), false);
});

test('Android: câmera file:// e seletor content:// preservam URI, nome e MIME no descritor nativo', async () => {
  for (const file of [doc, { ...doc, uri: 'content://provider/synthetic.pdf', name: 'synthetic.pdf', mimeType: 'application/pdf' }]) {
    const body = await multipart.createReceiptMultipart(file, new AbortController().signal);
    assert.deepEqual(plain(body.parts), [['document', { uri: file.uri, name: file.name, type: file.mimeType }]]);
  }
  await assert.rejects(multipart.createReceiptMultipart({ ...doc, uri: 'https://example.invalid/file' }, new AbortController().signal));
});

test('Web: Blob/File local gera multipart real com boundary, um arquivo e bytes intactos', async () => {
  const file = new File(['synthetic-pdf'], 'synthetic.pdf', { type: 'application/pdf' });
  const uri = URL.createObjectURL(file);
  try {
    const web = loadTypeScript('src/services/receiptMultipartService.web.ts', { './receiptDocumentService': documentService }, {
      FormData, fetch: (url, options) => {
        assert.equal(url, uri);
        assert.equal('headers' in options, false);
        return fetch(url, options);
      }
    });
    const body = await web.createReceiptMultipart({ ...doc, uri, size: file.size, name: file.name, mimeType: file.type }, new AbortController().signal);
    assert.deepEqual([...body.keys()], ['document']);
    assert.equal(body.get('document').name, file.name);
    assert.equal(body.get('document').type, file.type);
    assert.equal(await body.get('document').text(), 'synthetic-pdf');
    const request = new Request('https://example.invalid', { method: 'POST', body });
    assert.match(request.headers.get('Content-Type'), /^multipart\/form-data; boundary=/);
    assert.match(await request.text(), /name="document"; filename="synthetic.pdf"/);
    await assert.rejects(web.createReceiptMultipart({ ...doc, uri, size: file.size + 1 }, new AbortController().signal));
    await assert.rejects(web.createReceiptMultipart({ ...doc, uri: 'https://example.invalid/file' }, new AbortController().signal));
  } finally { URL.revokeObjectURL(uri); }
});

test('contrato completo é aplicável e contém aviso demonstrativo, sem exigir code', async () => {
  const f = fixture({ body: response('success', { description: 'Compra sintética', amount: 12.34, type: 'outcome', category: 'Alimentação', identifiedDate: '2026-09-15' }) });
  const result = await f.service.analyze(doc, context);
  assert.equal(result.status, 'success');
  assert.equal(result.isSimulated, true);
  assert.match(result.message, /demonstrativos, não extraídos/);
  assert.equal('code' in result, false);
  assert.equal(result.fields.amount, 12.34);
});

test('leitura parcial não inventa categoria nem total ausente', async () => {
  const f = fixture({ body: response('partial', { description: 'Compra sintética', type: 'outcome' }) });
  const result = await f.service.analyze(doc, context);
  assert.equal(result.status, 'partial');
  assert.equal('category' in result.fields, false);
  assert.equal('amount' in result.fields, false);
});

test('documento rejeitado ou ilegível vira erro sem campos financeiros', () => {
  for (const [documentStatus, acceptance] of [['rejected', 'rejected'], ['inconclusive', 'undetermined']]) {
    const body = { ...response(), status: 'error', documentStatus };
    delete body.fields;
    body.assessment = { ...body.assessment, acceptance, fields: {} };
    const result = parser.parseSimulatedReceiptResponse(body);
    assert.equal(result.status, 'error');
    assert.equal('fields' in result, false);
  }
});

test('respostas inválidas, reais, incertas, sem avaliação ou com centavos fracionários não fornecem campos', () => {
  const invalid = [null, {}, { ...response(), isSimulated: false }, { ...response(), assessment: undefined },
    response('success'), response('partial', { amount: 1.001 }), response('partial', { amount: -1 }),
    response('partial', { amount: Number.MAX_SAFE_INTEGER }), response('partial', { type: 'invalid' }),
    response('partial', { description: ' ' }), response('partial', { date: '2026-09-15' }),
    response('partial', { identifiedDate: '2026-02-30' })];
  const uncertain = response(); uncertain.assessment.uncertainFields = ['amount']; invalid.push(uncertain);
  const missing = response(); missing.assessment.missingFields = ['amount']; invalid.push(missing);
  const mismatch = response(); mismatch.assessment.fields.amount = 999; invalid.push(mismatch);
  for (const body of invalid) {
    const result = parser.parseSimulatedReceiptResponse(body);
    assert.equal(result.status, 'error');
    assert.equal('fields' in result, false);
  }
});

for (const status of [400, 401, 403, 413, 415, 422, 429, 501, 503, 504]) {
  test(`HTTP ${status} preserva dados e não usa o corpo de erro como análise`, async () => {
    const f = fixture({ status, body: response('success', { amount: 99999 }) });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, 'error');
    assert.equal('fields' in result, false);
    assert.equal(f.requests.length, 1); // sem retry.
  });
}

test('usuário ausente ou token indisponível não inicia upload nem expõe erro/token', async () => {
  for (const user of [null, { getIdToken: async () => { throw new Error('synthetic-secret-token'); } }]) {
    const f = fixture({ user });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, 'error');
    assert.equal(f.requests.length, 0);
    assert.equal(JSON.stringify(result).includes('synthetic-secret-token'), false);
  }
});

test('troca de usuário durante obtenção de token ou resposta invalida resultado', async () => {
  const token = deferred();
  const f = fixture({ user: { getIdToken: () => token.promise } });
  const pending = f.service.analyze(doc, context);
  f.auth.currentUser = { uid: 'other' };
  token.resolve('synthetic-token');
  assert.equal((await pending).status, 'error');
  assert.equal(f.requests.length, 0);
  const reply = deferred();
  const g = fixture({ fetch: () => reply.promise });
  const next = g.service.analyze(doc, context);
  await new Promise(resolve => setImmediate(resolve));
  g.auth.currentUser = null;
  reply.resolve({ status: 200, json: async () => response() });
  assert.equal((await next).status, 'error');
});

test('documento inválido ou API sem configuração não inicia requisição', async () => {
  const f = fixture();
  for (const size of [0, NaN, documentService.MAX_RECEIPT_SIZE + 1]) {
    assert.equal((await f.service.analyze({ ...doc, size }, context)).status, 'error');
  }
  assert.equal(f.requests.length, 0);
  for (const baseURL of ['http://IP_DO_COMPUTADOR:3000', 'ftp://example.invalid', 'https://user:secret@example.invalid', 'https://example.invalid?token=secret']) {
    const g = fixture({ baseURL });
    assert.equal((await g.service.analyze(doc, context)).status, 'error');
    assert.equal(g.requests.length, 0);
  }
});

test('rede indisponível e JSON inválido não expõem erros brutos nem geram fallback', async () => {
  for (const fetch of [async () => { throw new Error('synthetic-secret-token'); },
    async () => ({ status: 200, json: async () => { throw new Error('invalid json'); } })]) {
    const f = fixture({ fetch });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, 'error');
    assert.equal('fields' in result, false);
    assert.equal(JSON.stringify(result).includes('synthetic-secret-token'), false);
    assert.equal(f.requests.length, 1);
  }
});

test('cancelamento anterior não obtém token nem envia arquivo', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  assert.equal((await f.service.analyze(doc, context, controller.signal)).status, 'cancelled');
  assert.equal(f.tokenCalls(), 0);
  assert.equal(f.requests.length, 0);
});

test('cancelamento durante getIdToken retorna imediatamente e impede upload tardio', async () => {
  const token = deferred();
  const f = fixture({ user: { getIdToken: () => token.promise } });
  const controller = new AbortController();
  const pending = f.service.analyze(doc, context, controller.signal);
  controller.abort();
  assert.equal((await pending).status, 'cancelled');
  token.resolve('synthetic-token');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('cancelamento durante preparação ou requisição aborta e não decodifica resposta antiga', async () => {
  for (const stage of ['multipart', 'request']) {
    const done = deferred();
    const f = fixture(stage === 'multipart'
      ? { multipart: { createReceiptMultipart: () => done.promise } }
      : { fetch: () => done.promise });
    const controller = new AbortController();
    const pending = f.service.analyze(doc, context, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    assert.equal((await pending).status, 'cancelled');
    let decoded = false;
    done.resolve(stage === 'multipart' ? {} : { status: 200, json: async () => { decoded = true; return response(); } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decoded, false);
    assert.equal(f.requests.length, stage === 'multipart' ? 0 : 1);
    if (stage === 'request') assert.equal(f.requests[0][1].signal.aborted, true);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('timeout aborta requisição e descarta resposta atrasada mesmo com transporte não cooperativo', async () => {
  const reply = deferred();
  const f = fixture({ timeoutMs: 10, fetch: () => reply.promise });
  const result = await f.service.analyze(doc, context);
  assert.equal(result.status, 'error');
  assert.match(result.message, /demorou demais/);
  assert.equal(f.requests[0][1].signal.aborted, true);
  let decoded = false;
  reply.resolve({ status: 200, json: async () => { decoded = true; return response(); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(decoded, false);
});

function modeFixture(mode, development = true) {
  const calls = { mock: 0, backend: 0 };
  const module = loadTypeScript('src/services/receiptAnalysisService.ts', {
    '../constants/receiptMockConfig': { receiptMockConfig: { scenario: 'success', delayMs: 0 } },
    './receiptMockService': { createReceiptMockService: () => ({ analyze: async () => { calls.mock++; return { status: 'success', provider: 'mock' }; } }) },
    './receiptBackendService': {
      receiptBackendService: { analyze: async () => { calls.backend++; return { status: 'error', provider: 'backend', isSimulated: true }; } },
      receiptRealBackendService: { analyze: async () => { calls.backend++; return { status: 'error', provider: 'backend', isSimulated: false }; } }
    }
  }, { __DEV__: development, process: { env: { EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE: mode } } });
  return { ...module, calls };
}

test('mock é padrão e modo explícito mantém a seleção local', async () => {
  for (const mode of [undefined, 'mock']) {
    const f = modeFixture(mode);
    assert.equal(f.receiptAnalysisMode, 'mock');
    assert.equal((await f.receiptAnalysisService.analyze(doc, context)).provider, 'mock');
    assert.deepEqual(f.calls, { mock: 1, backend: 0 });
  }
});

test('backend simulado exige seleção explícita e erro não faz fallback para mock', async () => {
  const f = modeFixture('backend-simulated');
  assert.equal(f.receiptAnalysisMode, 'backend-simulated');
  assert.equal((await f.receiptAnalysisService.analyze(doc, context)).status, 'error');
  assert.deepEqual(f.calls, { mock: 0, backend: 1 });
});

test('modo desconhecido ou backend em produção bloqueia sem selecionar outro provedor', async () => {
  for (const [mode, development] of [['real', true], ['', true], ['backend-simulated', false], ['backend-real', false]]) {
    const f = modeFixture(mode, development);
    assert.equal(f.receiptAnalysisMode, 'unavailable');
    assert.equal((await f.receiptAnalysisService.analyze(doc, context)).status, 'error');
    assert.deepEqual(f.calls, { mock: 0, backend: 0 });
  }
});

const realResponse = (status = 'partial', fields = { description: 'Compra no mercado', amount: 24.9, type: 'outcome' }) => ({
  ...response(status, fields), isSimulated: false, message: 'UNTRUSTED-NETWORK-MESSAGE'
});
const realDocumentFailure = (documentStatus, acceptance, fields = {}) => {
  const value = realResponse(); delete value.fields;
  return { ...value, status: 'error', documentStatus,
    assessment: { ...value.assessment, acceptance, fields } };
};

test('backend real exige seleção explícita de desenvolvimento e não faz fallback', async () => {
  const f = modeFixture('backend-real');
  assert.equal(f.receiptAnalysisMode, 'backend-real');
  assert.equal((await f.receiptAnalysisService.analyze(doc, context)).isSimulated, false);
  assert.deepEqual(f.calls, { mock: 0, backend: 1 });
});

test('respostas reais completas e parciais passam pelo mesmo upload autenticado com origem preservada', async () => {
  for (const status of ['success', 'partial']) {
    const body = realResponse(status, { description: 'Compra no mercado', amount: 24.9, type: 'outcome',
      ...(status === 'success' ? { category: 'Alimentação' } : {}), identifiedDate: '2026-10-14' });
    const f = fixture({ mode: 'real', body });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, status); assert.equal(result.documentStatus, status); assert.equal(result.isSimulated, false);
    assert.equal(result.fields.amount, 24.9); assert.equal(result.fields.identifiedDate, '2026-10-14');
    assert.doesNotMatch(result.message, /simulad|demonstrativ|UNTRUSTED/);
    assert.equal(f.requests.length, 1); assert.equal(f.tokenCalls(), 1);
    assert.deepEqual(plain(f.requests[0][1].headers), { Authorization: 'Bearer synthetic-secret-token' });
    assert.equal(JSON.stringify(result).includes('synthetic-secret-token'), false);
    if (status === 'partial') assert.equal('category' in result.fields, false);
  }
});

test('rejeição e inconclusão reais preservam o estado documental sem campos aplicáveis', async () => {
  for (const [status, acceptance, fields] of [
    ['rejected', 'rejected', {}], ['inconclusive', 'undetermined', {}],
    ['inconclusive', 'accepted', {}], ['inconclusive', 'accepted', { identifiedDate: '2026-10-14' }]
  ]) {
    const f = fixture({ mode: 'real', body: realDocumentFailure(status, acceptance, fields) });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, 'error'); assert.equal(result.documentStatus, status); assert.equal(result.isSimulated, false);
    assert.equal('fields' in result, false); assert.doesNotMatch(result.message, /Simulação|UNTRUSTED/);
  }
});

test('origem real e simulada divergentes do modo solicitado são rejeitadas sem campos', () => {
  for (const [body, mode] of [[realResponse(), 'simulated'], [response(), 'real'],
    [{ ...realResponse(), isSimulated: 'false' }, 'real'], [{ ...realResponse(), provider: 'mock' }, 'real']]) {
    const result = parser.parseReceiptBackendResponse(body, mode);
    assert.equal(result.status, 'error'); assert.equal('fields' in result, false);
    assert.equal(result.documentStatus, undefined);
  }
});

test('contratos reais inválidos não escapam pelas respostas documentais nem por metadados', () => {
  const invalid = [null, {}, { ...realResponse(), assessment: undefined }, realResponse('success'),
    realResponse('partial', {}), realResponse('partial', { identifiedDate: '2026-10-14' }),
    realResponse('partial', { category: 'Alimentação' }),
    realResponse('partial', { amount: 1.001 }), realResponse('partial', { amount: 1000000.01 }),
    realResponse('partial', { amount: -1 }), realResponse('partial', { amount: Infinity }),
    realResponse('partial', { type: 'expense' }), realResponse('partial', { description: ' ' }),
    realResponse('partial', { date: '2026-10-14' }), realResponse('partial', { identifiedDate: '0000-01-01' }),
    realResponse('partial', { identifiedDate: '2026-02-30' }), realDocumentFailure('rejected', 'accepted'),
    realDocumentFailure('rejected', 'rejected', { amount: 24.9 }),
    realDocumentFailure('inconclusive', 'accepted', { description: 'Unsafe' }),
    realDocumentFailure('inconclusive', 'undetermined', { identifiedDate: '2026-10-14' }),
    realDocumentFailure('inconclusive', 'accepted', { identifiedDate: 'invalid' })];
  for (const mutate of [
    value => { value.assessment.fields.amount = 999; },
    value => { value.assessment.missingFields = ['amount']; },
    value => { value.assessment.uncertainFields = ['amount']; },
    value => { value.assessment.missingFields = ['merchant', 'merchant']; },
    value => { value.assessment.missingFields = ['merchant']; value.assessment.uncertainFields = ['merchant']; },
    value => { value.assessment.reasonCodes = ['UNTRUSTED-NETWORK-MESSAGE']; },
    value => { value.documentStatus = 'success'; }
  ]) { const value = realResponse(); mutate(value); invalid.push(value); }
  for (const body of invalid) {
    const result = parser.parseReceiptBackendResponse(body, 'real');
    assert.equal(result.status, 'error'); assert.equal('fields' in result, false); assert.equal(result.documentStatus, undefined);
    assert.equal(JSON.stringify(result).includes('UNTRUSTED'), false);
  }
});

test('parcial real omite campos ausentes e incertos sem inventar total, tipo ou categoria', () => {
  const body = realResponse('partial', { description: 'Serviço reconhecido' });
  body.assessment.missingFields = ['amount', 'category']; body.assessment.uncertainFields = ['type'];
  const result = parser.parseReceiptBackendResponse(body, 'real');
  assert.equal(result.status, 'partial'); assert.deepEqual(plain(result.fields), { description: 'Serviço reconhecido' });
});

test('falhas HTTP reais não aplicam corpo de erro, vazam mensagens ou fazem retry', async () => {
  for (const status of [400, 401, 403, 413, 415, 422, 429, 501, 503, 504]) {
    const f = fixture({ mode: 'real', status, body: realResponse('success', { amount: 9999 }) });
    const result = await f.service.analyze(doc, context);
    assert.equal(result.status, 'error'); assert.equal(result.isSimulated, false); assert.equal('fields' in result, false);
    assert.equal(result.documentStatus, undefined); assert.equal(f.requests.length, 1);
    assert.equal(JSON.stringify(result).includes('UNTRUSTED'), false);
  }
});

test('troca de sessão durante JSON real e falha de token impedem aplicação', async () => {
  const decoded = deferred();
  const f = fixture({ mode: 'real', fetch: async () => ({ status: 200, json: () => decoded.promise }) });
  const pending = f.service.analyze(doc, context); await new Promise(resolve => setImmediate(resolve));
  f.auth.currentUser = null; decoded.resolve(realResponse());
  assert.equal((await pending).status, 'error');
  const g = fixture({ mode: 'real', user: { getIdToken: async () => { throw new Error('private'); } } });
  assert.equal((await g.service.analyze(doc, context)).status, 'error'); assert.equal(g.requests.length, 0);
});

test('cancelamento e timeout reais descartam respostas tardias sem fallback', async () => {
  for (const timeout of [false, true]) {
    const reply = deferred(); const controller = new AbortController();
    const f = fixture({ mode: 'real', timeoutMs: timeout ? 10 : 1000, fetch: () => reply.promise });
    const pending = f.service.analyze(doc, context, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    if (!timeout) controller.abort();
    const result = await pending;
    assert.equal(result.status, timeout ? 'error' : 'cancelled'); assert.equal(result.isSimulated, false);
    assert.equal('fields' in result, false); assert.equal(f.requests.length, 1);
    let decoded = false;
    reply.resolve({ status: 200, json: async () => { decoded = true; return realResponse(); } });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(decoded, false);
  }
});

test('URL configurável reutiliza cliente HTTP e preserva timeout e fallback anteriores', () => {
  for (const url of [undefined, 'https://api.example.invalid']) {
    const { api } = loadTypeScript('src/services/api.ts', {
      axios: { default: { create: options => ({ defaults: options }) } }
    }, { process: { env: { EXPO_PUBLIC_API_URL: url } } });
    assert.equal(api.defaults.baseURL, url ?? 'http://IP_DO_COMPUTADOR:3000');
    assert.equal(api.defaults.timeout, 10000);
  }
});
