const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const OpenAI = require('../financeiq-api/node_modules/openai').default;
const { startReceiptPilot } = require('../financeiq-api/src/receiptPilot.ts');
const { createReceiptPilotLock } = require('../financeiq-api/src/services/receiptPilotLock.ts');
const { createReceiptPilotMetrics } = require('../financeiq-api/src/services/receiptPilotMetrics.ts');
const { createReceiptOpenAITransport } = require('../financeiq-api/src/services/receiptOpenAITransport.ts');
const { response } = require('./helpers/receiptResponsesMock.cjs');
const { image, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');

const sentinel = 'OFFLINE-PILOT-NOT-A-CREDENTIAL';
const settings = {
  NODE_ENV: 'development', PORT: '0', RECEIPT_PILOT_HOST: '127.0.0.1',
  FIREBASE_PROJECT_ID: 'offline-project', RECEIPT_PILOT_UIDS: 'pilot',
  RECEIPT_LIMITS_MODE: 'local-single-process', RECEIPT_REQUESTS_PER_MINUTE: '1', RECEIPT_REQUESTS_PER_DAY: '1', RECEIPT_GLOBAL_CONCURRENCY: '1',
  RECEIPT_ANALYSIS_MODE: 'real', RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'true',
  RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '1', RECEIPT_OPENAI_TIMEOUT_MS: '1500', RECEIPT_PROCESSING_TIMEOUT_MS: '3000',
  OPENAI_API_KEY: sentinel
};
const markerName = 'receipt-openai-first-attempt.lock';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ports = new Set();
const restore = [];
let blockedIO = 0;

test.before(() => {
  const replace = (target, key, value) => {
    const previous = target[key]; target[key] = value; restore.push(() => { target[key] = previous; }); return previous;
  };
  const deny = () => { blockedIO++; throw new Error('External I/O prohibited'); };
  replace(globalThis, 'fetch', deny);
  replace(OpenAI.prototype, 'makeRequest', deny);
  replace(require('node:tls'), 'connect', deny);
  for (const key of ['get', 'request']) replace(require('node:https'), key, deny);
  replace(http, 'get', deny);
  const originalRequest = http.request;
  replace(http, 'request', function(options, ...args) {
    if (options.hostname !== '127.0.0.1' || !ports.has(options.port)) return deny();
    return originalRequest.call(this, options, ...args);
  });
  const net = require('node:net');
  const originalConnect = net.Socket.prototype.connect;
  replace(net.Socket.prototype, 'connect', function(...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (!options || (options.host ?? options.hostname) !== '127.0.0.1' || !ports.has(Number(options.port))) return deny();
    return originalConnect.apply(this, args);
  });
  const childProcess = require('node:child_process');
  const fork = childProcess.fork;
  replace(childProcess, 'fork', (file, args, options) => fork(file, args, {
    ...options, execArgv: [...options.execArgv, '--require', path.resolve(__dirname, 'helpers/receiptWorkerIOGuard.cjs')]
  }));
});
test.afterEach(() => assert.equal(blockedIO, 0));
test.after(() => restore.reverse().forEach(reset => reset()));

async function folder(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'financeiq-pilot-test-'));
  t.after(async () => {
    // Exclusivo dos testes: nunca remove um marcador operacional.
    assert.equal(path.dirname(directory), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('financeiq-pilot-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });

async function endpoint(t, { directory, env = {}, reply = () => response() } = {}) {
  directory ??= await folder(t);
  const lines = []; const calls = []; const clients = []; const measured = deferred();
  const configuration = { ...settings, RECEIPT_OPENAI_PILOT_LOCK_DIR: directory, ...env };
  const server = await startReceiptPilot(configuration, {
    verifyToken: async token => {
      if (token === 'bad') throw Object.assign(new Error('PRIVATE-TOKEN'), { code: 'auth/invalid-id-token' });
      return { uid: token === 'offline-token' ? 'pilot' : 'outside' };
    },
    createOpenAIClient: options => {
      clients.push(options);
      return { responses: { async create(request, options) {
        assert.equal(await fs.readFile(path.join(directory, markerName), 'utf8'), 'financeiq-receipt-pilot-v1\n');
        assert.equal(options.maxRetries, 0);
        calls.push({ request, options });
        return reply(request, options);
      } } };
    },
    write: line => { lines.push(line); measured.resolve(JSON.parse(line)); }
  });
  const port = server.address().port; ports.add(port);
  t.after(async () => { await close(server); ports.delete(port); });
  const raw = (payload, onResponse, token = 'offline-token', route = '/receipts/analyze') => http.request({
    hostname: '127.0.0.1', port, path: route, method: 'POST',
    headers: { 'Content-Type': payload.contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, onResponse);
  const request = (payload, token, route) => new Promise((resolve, reject) => {
    const req = raw(payload, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    }, token, route);
    req.on('error', reject); req.end(payload.bytes);
  });
  return { directory, configuration, server, lines, calls, clients, measured, raw, request };
}
const png = async () => multipart([{ bytes: await image(), name: 'private-document.png' }]);
const noMarker = directory => assert.rejects(fs.lstat(path.join(directory, markerName)), { code: 'ENOENT' });
const aborted = signal => signal.aborted ? Promise.resolve() : new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));

test('piloto escuta somente em IPv4 loopback e conecta métricas ao fluxo HTTP real com cliente falso', async t => {
  const pilot = await endpoint(t);
  assert.equal(pilot.server.address().address, '127.0.0.1');
  await noMarker(pilot.directory);
  const result = await pilot.request(await png());
  assert.equal(result.status, 200); assert.equal(result.body.isSimulated, false);
  assert.equal(pilot.calls.length, 1); assert.equal(pilot.lines.length, 1);
  const metrics = JSON.parse(pilot.lines[0]);
  assert.equal(metrics.model, 'gpt-5.4-mini-2026-03-17'); assert.equal(metrics.status, 'partial');
  assert.equal(metrics.isSimulated, false); assert.equal(metrics.inputTokens, 3000);
  assert.equal(metrics.outputTokens, 500); assert.equal(metrics.cachedInputTokens, 1000);
  assert.equal(metrics.estimatedCostUsd, 0.003825); assert.equal(metrics.costStatus, 'estimated');
  assert.ok(metrics.durationMs >= 0);
  assert.equal(pilot.clients[0].logLevel, 'off'); assert.equal(pilot.clients[0].maxRetries, 0);
  for (const privateValue of [sentinel, 'offline-token', 'private-document.png', 'Mercado de Teste', '12990', 'data:image', 'output_text', 'pilotUIDs']) {
    assert.equal(pilot.lines.join('').includes(privateValue), false);
  }
});

test('piloto rejeita host/ambiente/UID/quotas/porta/configuração real inseguros antes de criar cliente', async t => {
  const directory = await folder(t);
  for (const change of [
    { RECEIPT_PILOT_HOST: undefined }, { RECEIPT_PILOT_HOST: '0.0.0.0' }, { RECEIPT_PILOT_HOST: 'localhost' }, { RECEIPT_PILOT_HOST: '::' },
    { NODE_ENV: 'production' }, { RECEIPT_PILOT_UIDS: 'pilot,other' }, { RECEIPT_PILOT_UIDS: '*' }, { RECEIPT_PILOT_UIDS: '' },
    { RECEIPT_REQUESTS_PER_MINUTE: '2' }, { RECEIPT_REQUESTS_PER_DAY: '2' }, { RECEIPT_GLOBAL_CONCURRENCY: '2' },
    { PORT: '-1' }, { PORT: '65536' }, { RECEIPT_LIMITS_MODE: '' }, { FIREBASE_PROJECT_ID: '' }, { FIREBASE_AUTH_EMULATOR_HOST: '' },
    { RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false' }, { OPENAI_API_KEY: '' }, { RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS: '' },
    { RECEIPT_OPENAI_TIMEOUT_MS: '3000' }, { RECEIPT_ANALYSIS_MODE: 'unknown' }, { RECEIPT_OPENAI_MODEL: 'unapproved' }
  ]) {
    await assert.rejects(startReceiptPilot({ ...settings, RECEIPT_OPENAI_PILOT_LOCK_DIR: directory, ...change }, {
      createOpenAIClient: () => assert.fail('Não deve criar cliente')
    }));
    await noMarker(directory);
  }
});

test('entrada convencional bloqueia modo real; disabled/simulated preservam listen normal', () => {
  for (const mode of ['real', 'disabled', 'simulated', undefined]) {
    const listens = []; const lines = []; const processFake = { env: { RECEIPT_ANALYSIS_MODE: mode } };
    loadTypeScript('financeiq-api/src/server.ts', {
      dotenv: { default: { config() {} } },
      './app': { createApp: () => ({ listen: (...args) => listens.push(args) }) }
    }, { process: processFake, console: { error: line => lines.push(line) } });
    assert.equal(listens.length, mode === 'real' ? 0 : 1);
    assert.equal(processFake.exitCode, mode === 'real' ? 1 : undefined);
    if (mode !== 'real') assert.equal(listens[0][1], '0.0.0.0');
    else assert.equal(lines.length, 1);
  }
});

test('bootstrap CLI não lê dotenv, não tem watcher e sanitiza falha de inicialização', async () => {
  const lines = []; const processFake = {};
  loadTypeScript('financeiq-api/src/receiptPilotServer.ts', {
    './receiptPilot': { startReceiptPilot: () => Promise.reject(new Error(sentinel)) }
  }, { process: processFake, console: { error: line => lines.push(line) } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(processFake.exitCode, 1); assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(sentinel), false);
  const pkg = require('../financeiq-api/package.json');
  assert.equal(pkg.scripts['start:receipt-pilot'], 'node dist/receiptPilotServer.js');
});

test('logs têm lista explícita e não serializam campos extras sensíveis', () => {
  const lines = [];
  const log = createReceiptPilotMetrics('gpt-4.1-mini', line => lines.push(JSON.parse(line)));
  log({ model: sentinel, isSimulated: false, status: sentinel, durationMs: 12,
    inputTokens: 1, cachedInputTokens: 0, outputTokens: 2, estimatedCostUsd: 0.01,
    raw: { key: sentinel }, document: sentinel, fields: { amount: 12990 }, token: sentinel });
  assert.deepEqual(Object.keys(lines[0]).sort(), ['event', 'model', 'isSimulated', 'status', 'durationMs', 'inputTokens', 'outputTokens', 'cachedInputTokens', 'estimatedCostUsd', 'costStatus'].sort());
  assert.equal(lines[0].model, 'gpt-4.1-mini'); assert.equal(lines[0].status, 'error');
  assert.equal(JSON.stringify(lines).includes(sentinel), false);
});

for (const [label, usage] of [['ausente', undefined], ['inválido', { input_tokens: -1, output_tokens: 10 }]]) {
  test(`usage ${label} produz custo explicitamente desconhecido no log HTTP`, async t => {
    const pilot = await endpoint(t, { reply: () => response(undefined, { usage }) });
    assert.equal((await pilot.request(await png())).status, 200);
    const metrics = JSON.parse(pilot.lines[0]);
    assert.equal(metrics.costStatus, 'unknown'); assert.equal(metrics.estimatedCostUsd, null);
    assert.equal(metrics.inputTokens, null); assert.equal(metrics.outputTokens, null); assert.equal(metrics.cachedInputTokens, null);
  });
}

test('marcador é criado atomicamente uma vez, sem segredos, e bloqueia reinicialização', async t => {
  const directory = await folder(t);
  const first = await createReceiptPilotLock(directory);
  const second = await createReceiptPilotLock(directory);
  const results = await Promise.allSettled([first.consume(), second.consume()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.deepEqual(await fs.readdir(directory), [markerName]);
  assert.equal(await fs.readFile(path.join(directory, markerName), 'utf8'), 'financeiq-receipt-pilot-v1\n');
  await assert.rejects(first.consume()); await assert.rejects(second.consume());
  await assert.rejects(createReceiptPilotLock(directory));
});

test('marcador vazio também bloqueia, sem recuperação automática', async t => {
  const directory = await folder(t);
  await fs.writeFile(path.join(directory, markerName), '', { flag: 'wx' });
  await assert.rejects(createReceiptPilotLock(directory));
  await assert.rejects(startReceiptPilot({ ...settings, RECEIPT_OPENAI_PILOT_LOCK_DIR: directory }));
  assert.equal((await fs.stat(path.join(directory, markerName))).size, 0);
});

test('trava fora do repositório é obrigatória; diretório ausente, arquivo e caminho relativo bloqueiam', async t => {
  const directory = await folder(t);
  const file = path.join(directory, 'file'); await fs.writeFile(file, 'test');
  for (const location of [undefined, '', '.', path.resolve(__dirname, '..'), path.resolve(__dirname, '../financeiq-api'), path.join(directory, 'missing'), file]) {
    await assert.rejects(createReceiptPilotLock(location));
  }
});

test('trava indisponível após bootstrap falha fechada e não permite reuso do mesmo consumidor', async t => {
  const directory = await folder(t);
  const lock = await createReceiptPilotLock(directory);
  // Simula indisponibilidade de escrita sem depender de ACLs/admin do Windows.
  await fs.mkdir(path.join(directory, markerName));
  await assert.rejects(lock.consume());
  await fs.rmdir(path.join(directory, markerName));
  await assert.rejects(lock.consume());
  await noMarker(directory);
});

test('O_EXCL impede dois processos e o terceiro processo reiniciado permanece bloqueado', async t => {
  const directory = await folder(t);
  const run = () => promisify(execFile)(process.execPath, [path.resolve(__dirname, 'helpers/receiptPilotLockProcess.cjs'), directory], {
    env: Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
    windowsHide: true, timeout: 30000, maxBuffer: 4096
  });
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map(result => result.stdout).sort(), ['blocked', 'consumed']);
  assert.equal((await run()).stdout, 'blocked');
});

test('duas requisições concorrentes no piloto mantêm quota/reserva e só uma chega ao provedor', async t => {
  const entered = deferred(); const release = deferred();
  const pilot = await endpoint(t, { reply: async () => { entered.resolve(); await release.promise; return response(); } });
  t.after(() => release.resolve());
  const payload = await png(); const first = pilot.request(payload);
  await entered.promise;
  assert.equal((await pilot.request(payload)).status, 429);
  assert.equal(pilot.calls.length, 1);
  release.resolve(); assert.equal((await first).status, 200);
  assert.equal((await pilot.request(payload)).status, 429);
});

test('dois servidores iniciados antes do consumo compartilham a mesma autorização persistente', async t => {
  const directory = await folder(t);
  const first = await endpoint(t, { directory }); const second = await endpoint(t, { directory });
  const payload = await png();
  const results = await Promise.all([first.request(payload), second.request(payload)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 503]);
  assert.equal(first.calls.length + second.calls.length, 1);
  assert.ok(results.every(result => result.body.isSimulated === false));
  const failed = results.find(result => result.status === 503);
  assert.equal('fields' in failed.body, false);
});

test('autenticação, UID externo e upload inválido não consomem autorização do provedor', async t => {
  const pilot = await endpoint(t); const payload = await png();
  for (const [token, status] of [[null, 401], ['bad', 401], ['outside-token', 403]]) {
    assert.equal((await pilot.request(payload, token)).status, status);
    await noMarker(pilot.directory);
  }
  const invalid = multipart([{ bytes: Buffer.from('invalid image') }]);
  assert.equal((await pilot.request(invalid)).status, 415);
  await noMarker(pilot.directory); assert.equal(pilot.calls.length, 0);
  // Quota de upload continua consumida; não liberar automaticamente após erro.
  assert.equal((await pilot.request(payload)).status, 429);
});

test('falha do provedor depois do consumo mantém marcador e não fornece fallback fictício', async t => {
  const pilot = await endpoint(t, { reply: () => { throw new Error(sentinel); } });
  const result = await pilot.request(await png());
  assert.equal(result.status, 503); assert.equal(result.body.isSimulated, false); assert.equal('fields' in result.body, false);
  assert.equal(pilot.calls.length, 1); assert.equal(JSON.parse(pilot.lines[0]).costStatus, 'unknown');
  assert.equal(pilot.lines.join('').includes(sentinel), false);
  await close(pilot.server);
  await assert.rejects(startReceiptPilot(pilot.configuration));
  assert.equal(await fs.readFile(path.join(pilot.directory, markerName), 'utf8'), 'financeiq-receipt-pilot-v1\n');
});

test('timeout após consumo mantém trava e aguarda encerramento do cliente falso', async t => {
  let ended = false;
  const pilot = await endpoint(t, { env: { RECEIPT_OPENAI_TIMEOUT_MS: '75' }, reply: async (_request, { signal }) => {
    await aborted(signal); ended = true; throw Object.assign(new Error(sentinel), { name: 'AbortError' });
  } });
  const result = await pilot.request(await png());
  assert.equal(result.status, 504); assert.equal(result.body.isSimulated, false); assert.equal('fields' in result.body, false);
  assert.equal(ended, true); assert.equal(pilot.calls.length, 1);
  assert.equal(JSON.parse(pilot.lines[0]).costStatus, 'unknown');
  await assert.rejects(createReceiptPilotLock(pilot.directory));
});

test('cancelamento HTTP após consumo não rearma trava nem registra conteúdo', async t => {
  const entered = deferred(); let ended = false;
  const pilot = await endpoint(t, { reply: async (_request, { signal }) => {
    entered.resolve(); await aborted(signal); ended = true; throw Object.assign(new Error(sentinel), { name: 'AbortError' });
  } });
  const payload = await png();
  const req = pilot.raw(payload, () => assert.fail('Cliente cancelado não recebe resultado'));
  const disconnected = new Promise(resolve => req.once('error', resolve));
  req.end(payload.bytes); await entered.promise; req.destroy(); await disconnected;
  const metrics = await pilot.measured.promise;
  assert.equal(ended, true); assert.equal(metrics.status, 'cancelled'); assert.equal(metrics.costStatus, 'unknown');
  await assert.rejects(createReceiptPilotLock(pilot.directory));
  assert.equal(pilot.lines.join('').includes(sentinel), false);
});

test('cancelamento durante aquisição da trava consome tentativa sem enviar ao provedor', async t => {
  const directory = await folder(t); const lock = await createReceiptPilotLock(directory);
  const controller = new AbortController(); let calls = 0;
  const transport = createReceiptOpenAITransport(settings, () => ({ responses: { create() { calls++; return response(); } } }), async () => {
    await lock.consume(); controller.abort();
  });
  await assert.rejects(transport.create({}, { signal: controller.signal }), { name: 'AbortError' });
  await transport.whenIdle(); assert.equal(calls, 0);
  await assert.rejects(createReceiptPilotLock(directory));
});

test('trava inacessível no envio impede inicializar cliente e é reportada sem fallback', async t => {
  const pilot = await endpoint(t);
  await fs.mkdir(path.join(pilot.directory, markerName));
  const result = await pilot.request(await png());
  assert.equal(result.status, 503); assert.equal(result.body.isSimulated, false); assert.equal('fields' in result.body, false);
  assert.equal(pilot.clients.length, 0); assert.equal(pilot.calls.length, 0);
  assert.equal(JSON.parse(pilot.lines[0]).costStatus, 'unknown');
});

for (const mode of ['disabled', 'simulated']) {
  test(`piloto ${mode} não consome marcador nem instancia SDK real`, async t => {
    const pilot = await endpoint(t, { env: { RECEIPT_ANALYSIS_MODE: mode, RECEIPT_OPENAI_REAL_CALLS_ENABLED: 'false', OPENAI_API_KEY: undefined, RECEIPT_SIMULATION_DELAY_MS: '0' } });
    const result = await pilot.request(await png());
    assert.equal(result.status, mode === 'disabled' ? 501 : 200);
    if (mode === 'simulated') {
      assert.equal(result.body.isSimulated, true); assert.match(result.body.message, /demonstrativos/);
      assert.equal(JSON.parse(pilot.lines[0]).isSimulated, true);
    } else assert.equal(pilot.lines.length, 0);
    assert.equal(pilot.clients.length, 0); await noMarker(pilot.directory);
  });
}

test('não há endpoint HTTP para destravar ou rearmar o piloto', async t => {
  const pilot = await endpoint(t); const payload = await png();
  assert.equal((await pilot.request(payload)).status, 200);
  for (const route of ['/receipts/unlock', '/receipts/reset', '/receipts/rearm']) assert.equal((await pilot.request(payload, 'offline-token', route)).status, 404);
  await assert.rejects(createReceiptPilotLock(pilot.directory));
  assert.equal(pilot.calls.length, 1);
});
