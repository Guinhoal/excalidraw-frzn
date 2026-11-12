const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function extractWithWindowsTar(archive, options) {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (!fs.existsSync(executable)) throw new Error('O extrator nativo tar.exe do Windows não foi encontrado.');
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-xvf', path.resolve(archive), '-C', path.resolve(options.dir)], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      signal: options.signal, timeout: options.timeoutMs || 180000
    });
    let details = '';
    const report = chunk => {
      const text = chunk.toString();
      details = (details + text).slice(-4000);
      for (const line of text.split(/[\r\n]+/).filter(Boolean)) options.log?.(`Extração: ${line}`);
    };
    child.stdout.on('data', report);
    child.stderr.on('data', report);
    child.once('error', error => reject(options.signal?.aborted ? options.signal.reason : error));
    child.once('close', (code, signal) => {
      if (options.signal?.aborted) reject(options.signal.reason);
      else if (child.killed || signal) reject(new Error('A extração excedeu o limite de tempo e o extrator foi encerrado.'));
      else if (code !== 0) reject(new Error(`Falha do extrator Windows (código ${code}): ${details}`));
      else resolve();
    });
  });
}

module.exports = { extractWithWindowsTar };
