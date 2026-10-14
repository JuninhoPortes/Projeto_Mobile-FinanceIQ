const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const express = require('../financeiq-api/node_modules/express');
const cors = require('../financeiq-api/node_modules/cors');

// Executar no mesmo realm do Express mantém os handlers async como Promises nativas.
// Imports fora da lista explícita falham, impedindo acesso a Firebase/HTTP reais.
function loadTypeScript(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', code)(exports, name => {
    if (!Object.prototype.hasOwnProperty.call(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, globals.process);
  return exports;
}

// Somente módulos reais do backend e mocks explícitos do Firebase/HTTP externo.
// Uma dependência inesperada (inclusive OpenAI) falha no loader existente.
const middleware = loadTypeScript('financeiq-api/src/middleware/receiptAuth.ts');
const controller = loadTypeScript('financeiq-api/src/controllers/receiptController.ts');
const receipts = loadTypeScript('financeiq-api/src/routes/receiptRoutes.ts', {
  express, '../controllers/receiptController': controller, '../middleware/receiptAuth': middleware,
  // Esta suíte isola a autenticação; upload real é coberto em receiptUpload.test.cjs.
  '../middleware/receiptUpload': { createReceiptUpload: () => (_req, _res, next) => next() }
});
const openFinanceService = loadTypeScript('financeiq-api/src/services/openFinanceMockService.ts');
const openFinanceController = loadTypeScript('financeiq-api/src/controllers/openFinanceController.ts', {
  '../services/openFinanceMockService': openFinanceService
});
const openFinanceRoutes = loadTypeScript('financeiq-api/src/routes/openFinanceRoutes.ts', {
  express, '../controllers/openFinanceController': openFinanceController
});
const externalCalls = [];
const indicatorsService = loadTypeScript('financeiq-api/src/services/indicatorsMockService.ts', {
  axios: { default: { create: ({ baseURL }) => ({ get: async path => {
    externalCalls.push({ baseURL, path });
    return baseURL.includes('brasilapi')
      ? { data: [{ nome: 'Selic', valor: 11 }, { nome: 'IPCA', valor: 4 }] }
      : { data: { rates: { BRL: 5 } } };
  } }) } }
});
const indicatorsController = loadTypeScript('financeiq-api/src/controllers/indicatorsController.ts', {
  '../services/indicatorsMockService': indicatorsService
});
const indicatorsRoutes = loadTypeScript('financeiq-api/src/routes/indicatorsRoutes.ts', {
  express, '../controllers/indicatorsController': indicatorsController
});

function firebaseRuntime({ env = { FIREBASE_PROJECT_ID: 'test-project' }, initError, verifyError, decoded = { uid: 'pilot-user' } } = {}) {
  const calls = { initialize: [], applicationDefault: 0, verify: [] };
  const apps = [];
  const sdk = loadTypeScript('financeiq-api/src/services/firebaseAdminService.ts', {
    'firebase-admin/app': {
      getApps: () => apps,
      applicationDefault: () => { calls.applicationDefault++; return 'fake-adc'; },
      initializeApp: (options, name) => {
        calls.initialize.push({ options, name });
        if (initError) throw initError;
        const app = { name, options };
        apps.push(app);
        return app;
      }
    },
    'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async (token, revoked) => {
      calls.verify.push({ token, revoked });
      if (verifyError) throw verifyError;
      return decoded;
    } }) }
  }, { process: { env } });
  return { ...sdk, calls, apps, env };
}

function appRuntime({ verifyToken, pilotUIDs = 'pilot-user', firebase = firebaseRuntime(), env = {}, useServerPolicy = false } = {}) {
  const { createApp } = loadTypeScript('financeiq-api/src/app.ts', {
    express: { default: express }, cors: { default: cors },
    './routes/openFinanceRoutes': openFinanceRoutes,
    './routes/indicatorsRoutes': indicatorsRoutes,
    './routes/receiptRoutes': receipts,
    './services/firebaseAdminService': firebase
  }, { process: { env } });
  return createApp(useServerPolicy ? { verifyToken } : { verifyToken, pilotUIDs });
}

async function serve(t, app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return (path = '/receipts/analyze', { method = 'POST', token, headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
        ...(data !== undefined ? { 'Content-Type': headers['Content-Type'] ?? 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => { resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : null }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

const codedError = code => Object.assign(new Error('sensitive-token-and-credentials'), { code });

test('sem token retorna 401 sem inicializar Firebase ou consultar serviços externos', async t => {
  const firebase = firebaseRuntime();
  const request = await serve(t, appRuntime({ firebase }));
  const response = await request();
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH_REQUIRED');
  assert.equal(response.headers['www-authenticate'], 'Bearer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(firebase.calls.initialize.length, 0);
  assert.equal(firebase.calls.verify.length, 0);
});

test('cabeçalhos malformados ou duplicados não chegam ao verificador', async t => {
  let calls = 0;
  const request = await serve(t, appRuntime({ verifyToken: async () => { calls++; return { uid: 'pilot-user' }; } }));
  for (const Authorization of ['Basic token', 'Bearer', 'Bearer token extra', 'Bearer  token', 'Bearer token, Bearer other', ['Bearer one', 'Bearer two']]) {
    assert.equal((await request(undefined, { headers: { Authorization } })).status, 401);
  }
  assert.equal(calls, 0);
});

test('token inválido retorna 401 e não expõe erro interno', async t => {
  const firebase = firebaseRuntime({ verifyError: codedError('auth/invalid-id-token') });
  const request = await serve(t, appRuntime({ firebase }));
  const response = await request(undefined, { token: 'invalid-token' });
  assert.equal(response.status, 401);
  assert.equal(JSON.stringify(response.body).includes('sensitive'), false);
  assert.deepEqual(firebase.calls.verify, [{ token: 'invalid-token', revoked: true }]);
});

test('token expirado retorna 401', async t => {
  const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ verifyError: codedError('auth/id-token-expired') }) }));
  assert.equal((await request(undefined, { token: 'expired-token' })).status, 401);
});

test('token revogado e usuário desabilitado são rejeitados', async t => {
  for (const code of ['auth/id-token-revoked', 'auth/user-disabled']) {
    const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ verifyError: codedError(code) }) }));
    assert.equal((await request(undefined, { token: 'revoked-token' })).status, 401);
  }
});

test('token válido e UID autorizado recebem 501 determinístico sem extração', async t => {
  const firebase = firebaseRuntime();
  const request = await serve(t, appRuntime({ firebase }));
  const first = await request(undefined, { token: 'valid-token' });
  const second = await request(undefined, { token: 'valid-token' });
  assert.equal(first.status, 501);
  assert.equal(first.body.error, true);
  assert.equal(first.body.code, 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED');
  assert.deepEqual(first.body, second.body);
  for (const key of ['fields', 'uid', 'userId', 'provider', 'isSimulated']) assert.equal(key in first.body, false);
  assert.equal(firebase.calls.initialize.length, 1);
  assert.equal(firebase.calls.applicationDefault, 1);
  assert.equal(firebase.calls.verify.length, 2);
});

test('usuário autenticado fora do piloto recebe 403', async t => {
  const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ decoded: { uid: 'other-user' } }) }));
  const response = await request(undefined, { token: 'valid-token' });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'RECEIPT_ACCESS_DENIED');
});

test('autorização nega por padrão e não aceita wildcard', async t => {
  for (const pilotUIDs of ['', ' , ', '*', 'pilot-user,*']) {
    const request = await serve(t, appRuntime({ pilotUIDs }));
    assert.equal((await request(undefined, { token: 'valid-token' })).status, 403);
  }
  const request = await serve(t, appRuntime({ useServerPolicy: true }));
  assert.equal((await request(undefined, { token: 'valid-token' })).status, 403);
});

test('configuração do servidor aceita lista explícita e exige correspondência exata', async t => {
  const request = await serve(t, appRuntime({ useServerPolicy: true, env: { RECEIPT_PILOT_UIDS: ' other-user, pilot-user , pilot-user ' } }));
  assert.equal((await request(undefined, { token: 'valid-token' })).status, 501);
  const denied = await serve(t, appRuntime({ pilotUIDs: 'pilot' }));
  assert.equal((await denied(undefined, { token: 'valid-token' })).status, 403);
});

test('userId no corpo ou query não falsifica a identidade nem autoriza acesso', async t => {
  const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ decoded: { uid: 'other-user' } }) }));
  assert.equal((await request('/receipts/analyze?userId=pilot-user', { token: 'valid-token', body: { userId: 'pilot-user' } })).status, 403);
  assert.equal((await request(undefined, { body: { userId: 'pilot-user', token: 'valid-token' } })).status, 401);
  const authorized = await serve(t, appRuntime());
  assert.equal((await authorized(undefined, { token: 'valid-token', body: { userId: 'other-user' } })).status, 501);
});

test('identidade vazia ou inválida retornada pelo verificador nunca autoriza', async t => {
  for (const decoded of [{ uid: '' }, { uid: '   ' }, {}, { uid: 7 }, { uid: 'a'.repeat(129) }]) {
    const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ decoded }) }));
    assert.equal((await request(undefined, { token: 'valid-token' })).status, 401);
  }
});

test('falha de inicialização Firebase retorna 503 sem dados sensíveis', async t => {
  const firebase = firebaseRuntime({ initError: new Error('private_key=secret-token') });
  const request = await serve(t, appRuntime({ firebase }));
  const response = await request(undefined, { token: 'valid-token' });
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'AUTH_UNAVAILABLE');
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
  assert.equal(firebase.calls.verify.length, 0);
});

test('falha operacional de verificação retorna 503 em vez de aceitar ou expor detalhes', async t => {
  for (const error of [new Error('credentials-secret'), codedError('auth/internal-error'), codedError('app/network-error')]) {
    const request = await serve(t, appRuntime({ firebase: firebaseRuntime({ verifyError: error }) }));
    const response = await request(undefined, { token: 'valid-token' });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'AUTH_UNAVAILABLE');
    assert.equal(JSON.stringify(response.body).includes('secret'), false);
  }
});

test('projeto ausente não inicializa SDK nem impede endpoints existentes', async t => {
  const firebase = firebaseRuntime({ env: {} });
  const request = await serve(t, appRuntime({ firebase }));
  assert.equal((await request(undefined, { token: 'valid-token' })).status, 503);
  assert.equal(firebase.calls.initialize.length, 0);
  assert.equal((await request('/health', { method: 'GET' })).status, 200);
  assert.equal((await request('/open-finance/accounts/example', { method: 'GET' })).status, 200);
});

test('modo de emulador nunca permite tokens sem assinatura nesta rota', async t => {
  for (const host of ['localhost:9099', '']) {
    const firebase = firebaseRuntime({ env: { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_AUTH_EMULATOR_HOST: host } });
    const request = await serve(t, appRuntime({ firebase }));
    assert.equal((await request(undefined, { token: 'unsigned-token' })).status, 503);
    assert.equal(firebase.calls.initialize.length, 0);
    assert.equal(firebase.calls.verify.length, 0);
  }
});

test('inicialização reutiliza app nomeado entre verificadores e rejeita projeto divergente', async () => {
  const firebase = firebaseRuntime();
  await firebase.createFirebaseTokenVerifier()('first');
  await firebase.createFirebaseTokenVerifier()('second');
  assert.equal(firebase.calls.initialize.length, 1);
  assert.deepEqual(firebase.calls.initialize[0], { name: 'financeiq-receipts', options: { projectId: 'test-project', credential: 'fake-adc' } });
  firebase.env.FIREBASE_PROJECT_ID = 'another-project';
  await assert.rejects(firebase.createFirebaseTokenVerifier()('third'), /mismatch/);
  assert.equal(firebase.calls.verify.length, 2);
});

test('autenticação isolada preserva resposta provisória sem consultar interpretadores externos', async t => {
  const request = await serve(t, appRuntime());
  const before = externalCalls.length;
  assert.equal((await request(undefined, { token: 'valid-token', body: '{invalid json' })).status, 501);
  assert.equal((await request(undefined, { token: 'valid-token', headers: { 'Content-Type': 'multipart/form-data; boundary=test' }, body: '--test\r\nfile-bytes' })).status, 501);
  assert.equal(externalCalls.length, before);
});

test('health, Open Finance, indicadores, CORS e 404 mantêm comportamento sem autenticação', async t => {
  const firebase = firebaseRuntime({ env: {} });
  const request = await serve(t, appRuntime({ firebase }));
  const health = await request('/health', { method: 'GET', headers: { Origin: 'https://example.test' } });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.message, 'FinanceIQ API funcionando corretamente.');
  assert.ok(Number.isFinite(Date.parse(health.body.timestamp)));
  assert.equal(health.headers['access-control-allow-origin'], '*');
  const userId = 'test-user';
  for (const [path, expected] of [
    [`/open-finance/accounts/${userId}`, openFinanceService.openFinanceMockService.getAccounts(userId)],
    [`/open-finance/balances/${userId}`, openFinanceService.openFinanceMockService.getBalances(userId)],
    [`/open-finance/transactions/${userId}`, openFinanceService.openFinanceMockService.getTransactions(userId)]
  ]) {
    const response = await request(path, { method: 'GET', headers: { Authorization: 'invalid' } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, JSON.parse(JSON.stringify(expected)));
  }
  const sync = await request(`/open-finance/sync/${userId}`, { body: { userId: 'spoofed' } });
  assert.equal(sync.status, 200);
  assert.deepEqual(sync.body, JSON.parse(JSON.stringify(openFinanceService.openFinanceMockService.syncTransactions(userId))));
  for (const [path, expected] of [
    ['/indicators/selic', await indicatorsService.indicatorsMockService.getSelic()],
    ['/indicators/ipca', await indicatorsService.indicatorsMockService.getIpca()],
    ['/indicators/dollar', await indicatorsService.indicatorsMockService.getDollar()],
    ['/indicators/summary', await indicatorsService.indicatorsMockService.getSummary()]
  ]) {
    const response = await request(path, { method: 'GET' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, JSON.parse(JSON.stringify(expected)));
  }
  const notFound = await request('/not-found', { method: 'GET' });
  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.body, { error: true, message: 'Rota não encontrada.' });
  assert.equal(firebase.calls.initialize.length, 0);
  assert.equal(firebase.calls.verify.length, 0);
});
