const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const http = require('node:http');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const OpenAI = require('../financeiq-api/node_modules/openai').default;
const { startReceiptLocal } = require('../financeiq-api/src/receiptLocal.ts');
const { loadReceiptLocalConfig } = require('../financeiq-api/src/services/receiptLocalConfig.ts');
const { createReceiptLocalAttempts } = require('../financeiq-api/src/services/receiptLocalAttempts.ts');
const { receiptRealOpenAIConfig } = require('../financeiq-api/src/services/receiptOpenAIAdapter.ts');
const { startReceiptPilot } = require('../financeiq-api/src/receiptPilot.ts');
const { commands } = require('../scripts/receipts-local.cjs');
const { image, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const { response, extraction } = require('./helpers/receiptResponsesMock.cjs');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');

const settings = { PORT: '0', RECEIPT_LOCAL_REAL_ENABLED: 'true', RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true',
  RECEIPT_LOCAL_UID: 'allowed', FIREBASE_PROJECT_ID: 'offline-project', OPENAI_API_KEY: 'OFFLINE-NOT-A-CREDENTIAL',
  RECEIPT_OPENAI_TIMEOUT_MS: '1000', RECEIPT_PROCESSING_TIMEOUT_MS: '2000' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ports = new Set(); const restore = []; let external = 0;
test.before(() => {
  const replace = (target, key, value) => { const prior = target[key]; target[key] = value; restore.push(() => { target[key] = prior; }); };
  const deny = () => { external++; throw new Error('External I/O blocked'); };
  replace(OpenAI.prototype, 'makeRequest', deny); replace(require('node:tls'), 'connect', deny);
  for (const key of ['request', 'get']) replace(require('node:https'), key, deny);
  const originalFetch = globalThis.fetch;
  replace(globalThis, 'fetch', (url, ...args) => {
    if (!String(url).startsWith('blob:')) {
      const parsed = new URL(url);
      if (parsed.hostname !== '127.0.0.1' || !ports.has(Number(parsed.port))) return deny();
    }
    return originalFetch(url, ...args);
  });
  const original = http.request;
  replace(http, 'request', function(options, ...args) {
    if (options.hostname !== '127.0.0.1' || !ports.has(options.port)) return deny();
    return original.call(this, options, ...args);
  });
  const childProcess = require('node:child_process'); const fork = childProcess.fork;
  replace(childProcess, 'fork', (file, args, options) => fork(file, args, { ...options,
    execArgv: [...options.execArgv, '--require', path.resolve(__dirname, 'helpers/receiptWorkerIOGuard.cjs')] }));
});
test.afterEach(() => assert.equal(external, 0));
test.after(() => restore.reverse().forEach(reset => reset()));

async function folder(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'financeiq-local-test-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('financeiq-local-test-'));
    await fs.rm(directory, { recursive: true, force: true }); // Somente fixtures do teste.
  });
  return directory;
}
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
async function endpoint(t, { directory, env = {}, reply = () => response() } = {}) {
  directory ??= await folder(t);
  const calls = []; const lines = []; const metric = deferred(); const clients = [];
  const server = await startReceiptLocal({ ...settings, ...env }, directory, {
    verifyToken: async token => {
      if (token === 'bad') throw Object.assign(new Error('PRIVATE'), { code: 'auth/invalid-id-token' });
      return { uid: token === 'session-id-token' ? 'allowed' : 'outside' };
    },
    createOpenAIClient: options => {
      clients.push(options);
      return { responses: { create(request, options) { calls.push({ request, options }); return reply(request, options); } } };
    }, write: line => { lines.push(line); metric.resolve(JSON.parse(line)); }
  });
  const port = server.address().port; ports.add(port);
  t.after(async () => { await close(server); ports.delete(port); });
  const raw = (payload, onResponse, { token = 'session-id-token', method = 'POST', origin } = {}) => http.request({
    hostname: '127.0.0.1', port, path: '/receipts/analyze', method,
    headers: { 'Content-Type': payload.contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}), ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } : {}) }
  }, onResponse);
  const request = (payload, options) => new Promise((resolve, reject) => {
    const req = raw(payload, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, body: bytes.length ? JSON.parse(bytes) : null }); });
    }, options);
    req.on('error', reject); req.end(payload.bytes);
  });
  return { server, directory, calls, lines, clients, request, raw, metric, baseURL: `http://127.0.0.1:${port}` };
}
const png = async () => multipart([{ bytes: await image() }]);
const attempts = directory => fs.readdir(path.join(directory, 'operational-attempts'));

test('entrada operacional usa loopback, flag explícita e pode analisar mais de uma vez sem orçamento de piloto', async t => {
  const local = await endpoint(t); const payload = await png();
  assert.equal(local.server.address().address, '127.0.0.1');
  for (let i = 0; i < 2; i++) {
    const result = await local.request(payload);
    assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false); assert.equal(result.body.status, 'partial');
  }
  assert.equal(local.calls.length, 2); assert.equal((await attempts(local.directory)).length, 2);
  assert.equal(local.clients[0].maxRetries, 0); assert.equal(local.clients[0].logLevel, 'off');
  assert.equal(JSON.parse(local.lines[0]).event, 'receipt_local_metrics');
  for (const sensitive of ['OFFLINE-NOT-A-CREDENTIAL', 'session-id-token', 'Mercado de Teste', 'data:image', '12990']) assert.equal(local.lines.join('').includes(sensitive), false);
});

test('configuração insegura bloqueia antes de inicializar cliente ou criar ledger', async t => {
  const directory = await folder(t);
  for (const change of [{ RECEIPT_LOCAL_REAL_ENABLED: undefined }, { RECEIPT_LOCAL_REAL_ENABLED: 'false' },
    { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' }, { NODE_ENV: 'production' }, { FIREBASE_AUTH_EMULATOR_HOST: '' },
    { RECEIPT_LOCAL_UID: '' }, { RECEIPT_LOCAL_UID: '*' }, { RECEIPT_LOCAL_UID: 'one,two' }, { FIREBASE_PROJECT_ID: '' },
    { OPENAI_API_KEY: '' }, { RECEIPT_REQUESTS_PER_DAY: '11' }, { RECEIPT_REQUESTS_PER_DAY: '0' },
    { RECEIPT_REQUESTS_PER_MINUTE: '6' }, { PORT: '65536' }, { RECEIPT_OPENAI_TIMEOUT_MS: '2000' }]) {
    await assert.rejects(startReceiptLocal({ ...settings, ...change }, directory, { createOpenAIClient: () => assert.fail('SDK não deve iniciar') }));
  }
  assert.deepEqual(await fs.readdir(directory), []);
});

test('piloto não pode selecionar o perfil operacional nem dispensar orçamento por esse perfil', async () => {
  await assert.rejects(startReceiptPilot({ ...settings, RECEIPT_REAL_PROFILE: 'local-operational',
    NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_PILOT_HOST: '127.0.0.1',
    RECEIPT_PILOT_UIDS: 'allowed', RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_REQUESTS_PER_MINUTE: '1',
    RECEIPT_REQUESTS_PER_DAY: '1', RECEIPT_GLOBAL_CONCURRENCY: '1'
  }), /Configuração do piloto indisponível/);
  assert.throws(() => receiptRealOpenAIConfig({ NODE_ENV: 'development', RECEIPT_ANALYSIS_MODE: 'real',
    RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true', RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_OPENAI_TIMEOUT_MS: '1000', RECEIPT_PROCESSING_TIMEOUT_MS: '2000' }));
});

test('arquivo externo de configuração é obrigatório e flags não são habilitadas pelo loader', async t => {
  const directory = await folder(t); const file = path.join(directory, 'backend.env');
  await fs.writeFile(file, 'RECEIPT_LOCAL_REAL_ENABLED=false\nFIREBASE_PROJECT_ID=offline\nOPENAI_API_KEY=OFFLINE-NOT-A-CREDENTIAL\n');
  const loaded = await loadReceiptLocalConfig(file, {});
  assert.equal(loaded.values.RECEIPT_LOCAL_REAL_ENABLED, 'false'); assert.equal(loaded.directory, directory);
  await assert.rejects(loadReceiptLocalConfig(path.join(directory, 'missing'), {}));
  await assert.rejects(loadReceiptLocalConfig(path.resolve(__dirname, '../financeiq-api/.env.example'), {}));
  await assert.rejects(loadReceiptLocalConfig(file, { NODE_ENV: 'production' }));
  await assert.rejects(loadReceiptLocalConfig(file, { FIREBASE_AUTH_EMULATOR_HOST: '' }));
  await fs.writeFile(file, 'NODE_OPTIONS=unsafe\n'); await assert.rejects(loadReceiptLocalConfig(file, {}));
  await fs.writeFile(file, 'GOOGLE_APPLICATION_CREDENTIALS=relative.json\n'); await assert.rejects(loadReceiptLocalConfig(file, {}));
});

test('ledger tem teto persistente e atomicidade entre consumidores, sem dados privados', async t => {
  const directory = await folder(t);
  const first = await createReceiptLocalAttempts(directory, 2); const second = await createReceiptLocalAttempts(directory, 2);
  const results = await Promise.allSettled([first(), first(), second(), second()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'RATE_LIMIT').length, 2);
  const restarted = await createReceiptLocalAttempts(directory, 2); await assert.rejects(restarted(), { code: 'RATE_LIMIT' });
  for (const name of await attempts(directory)) assert.equal(await fs.readFile(path.join(directory, 'operational-attempts', name), 'utf8'), 'financeiq-local-attempt-v1\n');
});

test('dia UTC novo permite quota nova sem apagar o histórico anterior', async t => {
  const directory = await folder(t); let day = '2026-10-14';
  const consume = await createReceiptLocalAttempts(directory, 1, () => new Date(day + 'T12:00:00Z'));
  await consume(); await assert.rejects(consume(), { code: 'RATE_LIMIT' });
  day = '2026-10-15'; await consume(); assert.equal((await attempts(directory)).length, 2);
});

test('falha de escrita do ledger impede envio e não inventa uso', async t => {
  const local = await endpoint(t);
  await fs.rmdir(path.join(local.directory, 'operational-attempts'));
  const result = await local.request(await png()); assert.equal(result.status, 503); assert.equal(local.calls.length, 0);
});

test('requisições simultâneas e quota por minuto mantêm somente um provedor ativo', async t => {
  const entered = deferred(); const release = deferred();
  const local = await endpoint(t, { reply: async () => { entered.resolve(); await release.promise; return response(); } });
  const payload = await png(); const first = local.request(payload); await entered.promise;
  assert.equal((await local.request(payload)).status, 429); assert.equal(local.calls.length, 1);
  release.resolve(); assert.equal((await first).status, 200);
  assert.equal((await local.request(payload)).status, 200);
  assert.equal((await local.request(payload)).status, 429); assert.equal(local.calls.length, 2);
});

test('falha após consumo e reinício não restauram autorização diária', async t => {
  const directory = await folder(t);
  const first = await endpoint(t, { directory, env: { RECEIPT_REQUESTS_PER_DAY: '1' }, reply: () => { throw new Error('PRIVATE'); } });
  assert.equal((await first.request(await png())).status, 503); await close(first.server);
  const second = await endpoint(t, { directory, env: { RECEIPT_REQUESTS_PER_DAY: '1' } });
  assert.equal((await second.request(await png())).status, 429); assert.equal(second.calls.length, 0);
});

test('autenticação e UID continuam obrigatórios antes de upload e consumo', async t => {
  const local = await endpoint(t); const payload = await png();
  for (const [token, status] of [[null, 401], ['bad', 401], ['outside', 403]]) assert.equal((await local.request(payload, { token })).status, status);
  assert.equal(local.calls.length, 0); assert.deepEqual(await attempts(local.directory), []);
});

test('preflight Web autoriza somente origens loopback do Expo e não consome quota', async t => {
  const local = await endpoint(t); const payload = { bytes: Buffer.alloc(0), contentType: 'multipart/form-data' };
  const accepted = await local.request(payload, { method: 'OPTIONS', origin: 'http://localhost:8081', token: null });
  assert.equal(accepted.headers['access-control-allow-origin'], 'http://localhost:8081');
  const denied = await local.request(payload, { method: 'OPTIONS', origin: 'https://example.invalid', token: null });
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  assert.equal(local.calls.length, 0); assert.deepEqual(await attempts(local.directory), []);
});

test('frontend autenticado → entrada operacional → resposta real falsa → patch revisável, sem tokens manuais', async t => {
  const local = await endpoint(t); const bytes = await image();
  const uri = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); t.after(() => URL.revokeObjectURL(uri));
  let tokenReads = 0;
  const documentService = loadTypeScript('src/services/receiptDocumentService.ts');
  const multipart = loadTypeScript('src/services/receiptMultipartService.web.ts', { './receiptDocumentService': documentService }, { FormData, fetch });
  const parser = loadTypeScript('src/services/receiptBackendResponseService.ts', {}, { Date });
  const { receiptRealBackendService } = loadTypeScript('src/services/receiptBackendService.ts', {
    '../../firebaseConfig': { auth: { currentUser: { getIdToken: async () => { tokenReads++; return 'session-id-token'; } } } },
    './api': { api: { defaults: { baseURL: local.baseURL } } }, './receiptDocumentService': documentService,
    './receiptMultipartService': multipart, './receiptBackendResponseService': parser
  }, { URL, fetch });
  const result = await receiptRealBackendService.analyze({ uri, name: 'synthetic.png', mimeType: 'image/png', size: bytes.length, source: 'file' }, { categories: [] });
  assert.equal(result.isSimulated, false); assert.equal(result.status, 'partial'); assert.equal(result.fields.amount, 129.9);
  assert.equal(tokenReads, 1); assert.equal(local.calls.length, 1);
  const { prepareReceiptFormPatch } = loadTypeScript('src/services/receiptFormService.ts');
  const patch = prepareReceiptFormPatch(result, { type: 'outcome', category: 'Compras' }, [{ name: 'Compras', type: 'outcome', is_active: true }]);
  assert.equal(patch.description, 'Compra em Mercado de Teste'); assert.equal(patch.amount, 129.9);
  assert.equal('category' in patch, false); assert.equal('identifiedDate' in patch, false);
  assert.deepEqual(Object.keys(patch).sort(), ['amount', 'description', 'type']);
});

test('rejeição e inconclusão continuam documentais sem fallback nem campos', async t => {
  for (const classification of ['other', 'unknown']) {
    const local = await endpoint(t, { reply: () => { const value = extraction(); value.document.classification = classification; return response(value); } });
    const result = await local.request(await png()); assert.equal(result.status, 200); assert.equal(result.body.status, 'error');
    assert.equal(result.body.documentStatus, classification === 'other' ? 'rejected' : 'inconclusive');
    assert.equal(result.body.isSimulated, false); assert.equal('fields' in result.body, false);
  }
});

test('timeout e cancelamento conservam tentativa consumida e sinalizam o provedor', async t => {
  for (const cancel of [false, true]) {
    const entered = deferred(); let ended = false;
    const local = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: cancel ? '1000' : '50' }, reply: async (_request, { signal }) => {
      entered.resolve(); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); ended = true;
      throw Object.assign(new Error('PRIVATE'), { name: 'AbortError' });
    } });
    const payload = await png();
    if (cancel) {
      const req = local.raw(payload, () => assert.fail('Cancelado'));
      const disconnected = new Promise(resolve => req.once('error', resolve));
      req.end(payload.bytes); await entered.promise; req.destroy(); await disconnected; await local.metric.promise;
    } else assert.equal((await local.request(payload)).status, 504);
    assert.equal(ended, true); assert.equal((await attempts(local.directory)).length, 1);
  }
});

test('comandos iniciam backend compilado sem watcher e frontend sem herdar segredos', () => {
  const source = { OPENAI_API_KEY: 'PRIVATE', FIREBASE_PROJECT_ID: 'PRIVATE', GOOGLE_APPLICATION_CREDENTIALS: 'PRIVATE',
    EXPO_PUBLIC_OPENAI_API_KEY: 'PRIVATE', RECEIPT_LOCAL_REAL_ENABLED: 'PRIVATE', NODE_OPTIONS: 'PRIVATE', PATH: 'PATH' };
  const backend = commands('backend', source);
  assert.equal(backend.length, 2); assert.ok(backend[1].args[0].endsWith('receiptLocalServer.js'));
  assert.equal(backend.flatMap(command => command.args).join('').includes('receiptPilot'), false);
  for (const mode of ['web', 'android']) {
    const plan = commands(mode, source);
    for (const command of plan) assert.equal(JSON.stringify(command).includes('PRIVATE'), false);
    const expo = plan.at(-1);
    assert.equal(expo.env.EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE, 'backend-real');
    assert.equal(expo.env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3002'); assert.equal(expo.env.EXPO_NO_DOTENV, '1');
    assert.ok(expo.args.includes('--localhost')); assert.ok(expo.args.includes('8081'));
    if (mode === 'android') { assert.equal(plan[0].args.join(' '), 'reverse tcp:3002 tcp:3002'); assert.equal(plan[1].args.join(' '), 'reverse tcp:8081 tcp:8081'); }
  }
  assert.throws(() => commands('web', { NODE_ENV: 'production' }));
  assert.throws(() => commands('android', { EXPO_PUBLIC_API_URL: 'http://192.168.0.1:3002' }));
  for (const url of ['https://remote.invalid', 'http://user:password@127.0.0.1:3002', 'http://127.0.0.1:3002?secret=value']) {
    assert.throws(() => commands('web', { EXPO_PUBLIC_API_URL: url }));
  }
});
