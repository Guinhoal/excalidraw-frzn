const path = require('node:path');
const { restoreElectron, packageDirectory } = require('./electron-runtime.cjs');

async function main() {
  const args = process.argv.slice(2);
  let archivePath;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--zip') throw new Error('Uso: npm run electron:repair [-- --zip "C:\\Downloads\\electron.zip"]');
    archivePath = path.resolve(args[1]);
  }
  const controller = new AbortController();
  const cancel = () => { process.exitCode = 130; controller.abort(new Error('Reparo interrompido pelo usuário.')); };
  process.once('SIGINT', cancel);
  let stage = 'Preparando reparo';
  const log = message => { stage = message; console.log(message); };
  const heartbeat = setInterval(() => console.log(`Aguardando conclusão: ${stage}`), 15000);
  // Abort the actual request/extractor; a Promise.race alone leaves it running.
  const timeout = setTimeout(() => controller.abort(new Error(`O reparo excedeu 5 minutos na etapa: ${stage}`)), 300000);
  try {
    const status = await restoreElectron(packageDirectory(), { archivePath, log, signal: controller.signal });
    console.log(`Electron ${status.version} disponível: ${status.executable}`);
    console.log('Agora execute npm run dev.');
  } finally { clearInterval(heartbeat); clearTimeout(timeout); process.removeListener('SIGINT', cancel); }
}

main().catch(error => {
  console.error(`\nNão foi possível reparar o Electron: ${error.message}`);
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|conexão/i.test(error.message)) {
    const { version } = require(path.join(packageDirectory(), 'package.json'));
    const artifact = `electron-v${version}-${process.platform}-${process.arch}.zip`;
    console.error(`Download manual: https://github.com/electron/electron/releases/download/v${version}/${artifact}`);
    console.error('Depois: npm run electron:repair -- --zip "CAMINHO_DO_ZIP"');
  }
  if (process.exitCode !== 130) process.exitCode = 1;
});
