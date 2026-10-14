// Processo separado para provar atomicidade/persistência, sem ambiente privado.
const path = require('node:path');
const deny = () => { throw new Error('External I/O prohibited'); };
globalThis.fetch = deny;
require('node:net').Socket.prototype.connect = deny;
require('node:tls').connect = deny;
for (const name of ['node:http', 'node:https']) {
  require(name).request = require(name).get = deny;
}
require('../../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../../financeiq-api/tsconfig.json') });
const { createReceiptPilotLock } = require('../../financeiq-api/src/services/receiptPilotLock.ts');
void createReceiptPilotLock(process.argv[2]).then(lock => lock.consume()).then(
  () => process.stdout.write('consumed'),
  () => process.stdout.write('blocked')
);
