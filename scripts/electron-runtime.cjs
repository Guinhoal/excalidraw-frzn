const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { extractWithWindowsTar } = require('./extract-electron.cjs');

function executableFor(platform) {
  if (platform === 'win32') return 'electron.exe';
  if (platform === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  return 'electron';
}

function inspectElectron(directory, platform = process.platform) {
  const { version } = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const relativeExecutable = executableFor(platform);
  const executable = path.join(directory, 'dist', relativeExecutable);
  const missing = [];
  let registeredPath;
  let installedVersion;
  try { registeredPath = fs.readFileSync(path.join(directory, 'path.txt'), 'utf8').trim(); }
  catch { missing.push('path.txt'); }
  if (registeredPath !== undefined && registeredPath !== relativeExecutable) missing.push('path.txt com caminho incorreto');
  try { installedVersion = fs.readFileSync(path.join(directory, 'dist', 'version'), 'utf8').trim().replace(/^v/, ''); }
  catch { missing.push('dist/version'); }
  if (installedVersion !== undefined && installedVersion !== version) missing.push(`binário de outra versão (${installedVersion})`);
  try { if (!fs.statSync(executable).isFile()) missing.push(relativeExecutable); }
  catch { missing.push(relativeExecutable); }
  return { ok: missing.length === 0, version, executable, missing };
}

async function archiveHash(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

async function restoreElectron(directory, options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const current = inspectElectron(directory, platform);
  if (current.ok && !options.archivePath && !options.force) return current;
  const log = options.log || (() => {});
  const artifact = `electron-v${current.version}-${platform}-${arch}.zip`;
  const checksums = JSON.parse(await fs.promises.readFile(path.join(directory, 'checksums.json'), 'utf8'));
  const expectedHash = checksums[artifact];
  if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw new Error(`O pacote não contém um SHA-256 válido para ${artifact}.`);
  const fromElectron = createRequire(path.join(directory, 'package.json'));
  let archive = options.archivePath;
  let downloadArtifact;
  const request = {
    version: current.version, artifactName: 'electron', platform, arch,
    checksums, force: false,
    cacheRoot: path.join(os.tmpdir(), 'excalidraw-frzn-electron-cache'),
    downloadOptions: { signal: options.signal }
  };
  if (!archive) {
    downloadArtifact = options.downloadArtifact || fromElectron('@electron/get').downloadArtifact;
    log(`Obtendo ${artifact} (reutilizando o cache, se disponível)...`);
    // Call the downloader directly: install.js has early-exit branches that can
    // report success without producing a local runtime. Do not inherit those.
    archive = await downloadArtifact(request);
  }
  log('Conferindo SHA-256 do arquivo...');
  let valid = await archiveHash(archive, options.signal) === expectedHash.toLowerCase();
  if (!valid && downloadArtifact) {
    log('O ZIP em cache está inválido. Baixando uma nova cópia...');
    archive = await downloadArtifact({ ...request, force: true });
    valid = await archiveHash(archive, options.signal) === expectedHash.toLowerCase();
  }
  if (!valid) {
    throw new Error(`SHA-256 inválido. Use o ZIP oficial ${artifact}; nenhum arquivo foi extraído.`);
  }
  const extract = options.extract || (platform === 'win32' && process.platform === 'win32'
    ? extractWithWindowsTar : fromElectron('@electron-internal/extract-zip').extract);
  const dist = path.join(directory, 'dist');
  await fs.promises.mkdir(dist, { recursive: true });
  log(platform === 'win32' ? 'Extraindo com o tar.exe nativo do Windows...' : 'Extraindo o Electron...');
  await extract(path.resolve(archive), {
    dir: path.resolve(dist), signal: options.signal, log,
    onEntry: entry => log(`Extração: ${entry.fileName}`)
  });
  options.signal?.throwIfAborted();
  const installed = (await fs.promises.readFile(path.join(dist, 'version'), 'utf8')).trim().replace(/^v/, '');
  if (installed !== current.version) throw new Error(`O ZIP contém a versão ${installed}, mas o projeto exige ${current.version}.`);
  const relativeExecutable = executableFor(platform);
  if (!(await fs.promises.stat(path.join(dist, relativeExecutable))).isFile()) throw new Error('O ZIP não criou o executável do Electron.');
  // Register the executable only after a verified archive was fully extracted.
  await fs.promises.writeFile(path.join(directory, 'path.txt'), relativeExecutable);
  const result = inspectElectron(directory, platform);
  if (!result.ok) throw new Error(`Instalação incompleta: ${result.missing.join(', ')}.`);
  return result;
}

function packageDirectory() {
  return path.dirname(require.resolve('electron/package.json'));
}

module.exports = { inspectElectron, restoreElectron, packageDirectory };
