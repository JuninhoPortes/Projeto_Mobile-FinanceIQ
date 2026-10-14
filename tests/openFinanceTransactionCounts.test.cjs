const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function service(overrides = {}) {
  const firestore = {
    collection: (_db, name) => name,
    doc: (_db, collection, id) => ({ collection, id }),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, ...filters) => ({ collection, filters }),
    serverTimestamp: () => 'server timestamp',
    Timestamp: { fromDate: date => date.toISOString() },
    ...overrides
  };
  return loadTypeScript('src/database/transactionService.ts', {
    'firebase/firestore': firestore,
    '../../firebaseConfig': { db: {} },
    '../services/periodService': { periodService: {
      getPeriodMonthFromDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    } }
  }, { Date }).transactionService;
}

test('importação conta ausentes e duplicadas preservando deduplicação, consultas e dados gravados', async () => {
  const existing = new Set(['existing']);
  const writes = [];
  const queries = [];
  const api = service({
    getDocs: async query => {
      queries.push(plain(query));
      return { empty: !existing.has(query.filters[1].value) };
    },
    addDoc: async (collection, data) => {
      assert.equal(collection, 'transactions');
      writes.push(plain(data));
      existing.add(data.external_id);
      return { id: data.external_id };
    }
  });
  const common = { description: 'Compra', amount: -25.5, type: 'outcome', date: '2026-09-15' };
  const input = [
    { ...common },
    { ...common, external_id: 'existing' },
    { ...common, externalId: 'new', bankName: 'Banco A', accountId: 'account-a' },
    { ...common, external_id: 'new' },
    { ...common, external_id: 'snake', bank_name: 'Banco B', account_id: 'account-b', category: 'Transporte' }
  ];
  assert.deepEqual(plain(await api.importFromOpenFinance('user', input)), { importedCount: 2, skippedCount: 3 });
  assert.equal(queries.length, 4);
  assert.ok(queries.every(query => query.collection === 'transactions' &&
    query.filters[0].field === 'user_id' && query.filters[0].operator === '==' && query.filters[0].value === 'user' &&
    query.filters[1].field === 'external_id' && query.filters[1].operator === '=='));
  assert.deepEqual(writes, [
    { external_id: 'new', bank_name: 'Banco A', account_id: 'account-a', category: 'Outros' },
    { external_id: 'snake', bank_name: 'Banco B', account_id: 'account-b', category: 'Transporte' }
  ].map(fields => ({
    user_id: 'user', description: 'Compra', amount: 25.5, type: 'outcome',
    ...fields, source: 'open_finance_mock', original_date: '2026-09-15',
    imported_at: 'server timestamp', date: new Date(2026, 8, 15).toISOString(),
    period_month: '2026-09', created_at: 'server timestamp', updated_at: 'server timestamp'
  })));
});

test('importação vazia retorna zero sem consultar ou gravar', async () => {
  assert.deepEqual(plain(await service().importFromOpenFinance('user', [])), { importedCount: 0, skippedCount: 0 });
});

test('falha de gravação continua rejeitando a importação sem reportar sucesso', async () => {
  const failure = new Error('write failed');
  const api = service({ getDocs: async () => ({ empty: true }), addDoc: async () => { throw failure; } });
  await assert.rejects(api.importFromOpenFinance('user', [{ external_id: 'new', date: '2026-09-15' }]), error => error === failure);
});

function snapshot(rows) {
  return { forEach: callback => rows.forEach(([id, data]) => callback({ id, data: () => data })) };
}

test('remoção conta somente exclusões concluídas e preserva filtros por usuário, origem e nome do banco', async () => {
  const done = deferred();
  const started = deferred();
  const deleted = [];
  const api = service({
    getDocs: async query => {
      assert.deepEqual(plain(query), { collection: 'transactions', filters: [{ field: 'user_id', operator: '==', value: 'user' }] });
      return snapshot([
        ['a', { source: 'open_finance_mock', bank_name: 'Banco A' }],
        ['b', { source: 'open_finance_mock', bank_name: 'Banco A' }],
        ['manual', { source: 'manual', bank_name: 'Banco A' }],
        ['other', { source: 'open_finance_mock', bank_name: 'Banco B' }]
      ]);
    },
    deleteDoc: async reference => {
      deleted.push(plain(reference));
      started.resolve();
      await done.promise;
    }
  });
  let resolved = false;
  const pending = api.removeOpenFinanceTransactionsByBank('user', 'Banco A').then(result => { resolved = true; return result; });
  await started.promise;
  assert.equal(resolved, false);
  done.resolve();
  assert.deepEqual(plain(await pending), { removedCount: 2 });
  assert.deepEqual(deleted, [{ collection: 'transactions', id: 'a' }, { collection: 'transactions', id: 'b' }]);
});

test('remoção sem correspondências retorna zero e mantém o critério bank_name', async () => {
  const api = service({ getDocs: async () => snapshot([
    ['a', { source: 'open_finance_mock', bank_name: 'Banco A', account_id: 'account-a' }]
  ]) });
  assert.deepEqual(plain(await api.removeOpenFinanceTransactionsByBank('user', 'account-a')), { removedCount: 0 });
});

test('falha de exclusão continua rejeitando a operação sem reportar sucesso', async () => {
  const failure = new Error('delete failed');
  const api = service({
    getDocs: async () => snapshot([['a', { source: 'open_finance_mock', bank_name: 'Banco A' }]]),
    deleteDoc: async () => { throw failure; }
  });
  await assert.rejects(api.removeOpenFinanceTransactionsByBank('user', 'Banco A'), error => error === failure);
});
