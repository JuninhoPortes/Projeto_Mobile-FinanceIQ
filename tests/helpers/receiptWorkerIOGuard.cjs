// Instrumentação exclusiva dos testes: falhar e contar tentativas de rede/escrita.
let attempts = 0;
const denied = () => { attempts++; throw new Error('Unexpected external I/O in validation'); };
for (const name of ['node:http', 'node:https']) {
  const api = require(name);
  api.request = api.get = denied;
}
const net = require('node:net');
net.connect = net.createConnection = net.Socket.prototype.connect = denied;
globalThis.fetch = denied;
const fs = require('node:fs');
fs.writeFile = fs.writeFileSync = fs.appendFile = fs.appendFileSync = fs.createWriteStream = denied;
fs.promises.writeFile = fs.promises.appendFile = denied;
const send = process.send.bind(process);
process.send = (message, ...args) => send({ ...message, externalIOAttempts: attempts }, ...args);
