const { inspectElectron, packageDirectory } = require('./electron-runtime.cjs');

try {
  const status = inspectElectron(packageDirectory());
  if (!status.ok) {
    console.error(`\nO pacote Electron ${status.version} está instalado, mas o aplicativo desktop está incompleto.`);
    console.error(`Faltando ou inválido: ${status.missing.join(', ')}.`);
    console.error('Execute: npm run electron:repair\nDepois: npm run dev\n');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Não foi possível localizar o Electron. Execute npm install e npm run electron:repair.');
  console.error(error.message);
  process.exitCode = 1;
}
