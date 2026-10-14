const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function commands(mode, source = process.env, config) {
  if (!['backend', 'web', 'android'].includes(mode)) throw new Error('Modo local inválido.');
  const env = { ...source };
  // Não herdar segredos do servidor em Metro, ADB, bundles ou processos frontend.
  for (const key of Object.keys(env)) {
    if (/^(OPENAI_|RECEIPT_|FIREBASE_)/.test(key) || /^EXPO_PUBLIC_.*(OPENAI|SECRET|TOKEN|PRIVATE|ADMIN)/.test(key) || key === 'GOOGLE_APPLICATION_CREDENTIALS') delete env[key];
  }
  delete env.NODE_OPTIONS;
  const node = args => ({ command: process.execPath, args, env, cwd: root });
  if (mode === 'backend') {
    if (source.NODE_ENV === 'production') throw new Error('Modo local bloqueado em produção.');
    return [node([path.join(root, 'financeiq-api/node_modules/typescript/bin/tsc'), '-p', path.join(root, 'financeiq-api/tsconfig.json')]),
      node([path.join(root, 'financeiq-api/dist/receiptLocalServer.js'), ...(config ? [config] : [])])];
  }
  if (source.NODE_ENV === 'production') throw new Error('Modo local bloqueado em produção.');
  Object.assign(env, { NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE: 'backend-real',
    EXPO_PUBLIC_API_URL: source.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3002' });
  const url = new URL(env.EXPO_PUBLIC_API_URL);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Operação local exige endpoint loopback HTTP sem credenciais.');
  }
  const result = [];
  if (mode === 'android') {
    const port = url.port || '80';
    for (const forwarded of [port, '8081']) result.push({ command: process.platform === 'win32' ? 'adb.exe' : 'adb', args: ['reverse', `tcp:${forwarded}`, `tcp:${forwarded}`], env, cwd: root });
  }
  result.push(node([path.join(root, 'node_modules/expo/bin/cli'), 'start', mode === 'web' ? '--web' : '--android', '--localhost', '--port', '8081']));
  return result;
}

async function run() {
  const [mode, option, config, ...rest] = process.argv.slice(2);
  if (rest.length || (option && (mode !== 'backend' || option !== '--config' || !config))) throw new Error('Argumentos inválidos.');
  for (const command of commands(mode, process.env, config)) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(command.command, command.args, { cwd: command.cwd, env: command.env, stdio: 'inherit', windowsHide: true });
      const stop = () => child.kill('SIGINT');
      process.once('SIGINT', stop);
      child.once('error', reject);
      child.once('exit', code => { process.removeListener('SIGINT', stop); resolve(code ?? 1); });
    });
    if (code !== 0) { process.exitCode = code; return; }
  }
}
module.exports = { commands };
if (require.main === module) void run().catch(() => {
  console.error('Inicialização local falhou. Confira configuração, dependências e ADB (Android). Consulte docs/receipts-local.md.');
  process.exitCode = 1;
});
