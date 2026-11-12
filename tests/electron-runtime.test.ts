import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'

const { inspectElectron, restoreElectron } = createRequire(import.meta.url)('../scripts/electron-runtime.cjs')

async function fixture(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-runtime-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'dist', 'locales'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '39.8.10' }))
  return root
}

test('pacote npm com apenas locales não é confundido com Electron instalado', async t => {
  const root = await fixture(t)
  const status = inspectElectron(root, 'win32')
  assert.equal(status.ok, false)
  assert.deepEqual(status.missing, ['path.txt', 'dist/version', 'electron.exe'])
})

test('reparo exige executável e metadados da versão correta', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'path.txt'), 'electron.exe')
  await fs.writeFile(path.join(root, 'dist', 'version'), '39.8.10')
  assert.equal(inspectElectron(root, 'win32').ok, false)
  await fs.writeFile(path.join(root, 'dist', 'electron.exe'), 'fixture')
  assert.equal(inspectElectron(root, 'win32').ok, true)
  await fs.writeFile(path.join(root, 'dist', 'version'), '38.0.0')
  assert.equal(inspectElectron(root, 'win32').ok, false)
})

test('path.txt apontando para fora do pacote é rejeitado', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'path.txt'), '../outro.exe')
  const status = inspectElectron(root, 'win32')
  assert.equal(status.ok, false)
  assert.ok(status.missing.includes('path.txt com caminho incorreto'))
})

async function archiveFixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await fixture(t)
  const archive = path.join(root, 'electron.zip')
  await fs.writeFile(archive, 'archive-fixture')
  const hash = createHash('sha256').update('archive-fixture').digest('hex')
  await fs.writeFile(path.join(root, 'checksums.json'), JSON.stringify({ 'electron-v39.8.10-win32-x64.zip': hash }))
  const extract = async (_archive: string, { dir }: { dir: string }) => {
    await fs.writeFile(path.join(dir, 'electron.exe'), 'fixture')
    await fs.writeFile(path.join(dir, 'version'), '39.8.10')
  }
  return { root, archive, extract }
}

test('reparo faz download direto e registra o executável mesmo com skip habilitado', async t => {
  const { root, archive, extract } = await archiveFixture(t)
  const previous = process.env.ELECTRON_SKIP_BINARY_DOWNLOAD
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
  t.after(() => { if (previous === undefined) delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD; else process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = previous })
  let downloaded = false
  const result = await restoreElectron(root, {
    platform: 'win32', arch: 'x64', extract,
    downloadArtifact: async (options: { version: string; checksums: unknown; force: boolean }) => {
      downloaded = true
      assert.equal(options.version, '39.8.10')
      assert.ok(options.checksums)
      assert.equal(options.force, false)
      return archive
    }
  })
  assert.equal(downloaded, true)
  assert.equal(result.ok, true)
  assert.equal(await fs.readFile(path.join(root, 'path.txt'), 'utf8'), 'electron.exe')
  assert.equal(process.env.ELECTRON_SKIP_BINARY_DOWNLOAD, '1')
})

test('ZIP manual é validado e instalado sem chamar a rede', async t => {
  const { root, archive, extract } = await archiveFixture(t)
  const result = await restoreElectron(root, {
    platform: 'win32', arch: 'x64', archivePath: archive, extract,
    downloadArtifact: () => { throw new Error('Não deve acessar a rede') }
  })
  assert.equal(result.ok, true)
})

test('arquivo corrompido é rejeitado antes da extração', async t => {
  const { root, archive } = await archiveFixture(t)
  await fs.writeFile(archive, 'corrompido')
  let extracted = false
  await assert.rejects(restoreElectron(root, {
    platform: 'win32', arch: 'x64', archivePath: archive,
    extract: async () => { extracted = true }
  }), /SHA-256 inválido/)
  assert.equal(extracted, false)
  assert.equal(inspectElectron(root, 'win32').ok, false)
})

test('extração que não produz arquivos não pode terminar com sucesso', async t => {
  const { root, archive } = await archiveFixture(t)
  await assert.rejects(restoreElectron(root, { platform: 'win32', arch: 'x64', archivePath: archive, extract: async () => {} }))
  assert.equal(inspectElectron(root, 'win32').ok, false)
})

test('falha do downloader é propagada sem registrar instalação', async t => {
  const { root } = await archiveFixture(t)
  await assert.rejects(restoreElectron(root, {
    platform: 'win32', arch: 'x64',
    downloadArtifact: async () => { throw new Error('ENOTFOUND github.com') }
  }), /ENOTFOUND/)
  assert.equal(inspectElectron(root, 'win32').ok, false)
})

async function writeStoredZip(file: string, entries: Record<string, string>) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name)
    const content = Buffer.from(text)
    const checksum = crc32(content)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4)
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(content.length, 18)
    header.writeUInt32LE(content.length, 22); header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, content)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6)
    record.writeUInt32LE(checksum, 16); record.writeUInt32LE(content.length, 20)
    record.writeUInt32LE(content.length, 24); record.writeUInt16LE(filename.length, 28)
    record.writeUInt32LE(offset, 42)
    central.push(record, filename)
    offset += header.length + filename.length + content.length
  }
  const index = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16)
  await fs.writeFile(file, Buffer.concat([...local, index, end]))
}

test('extrator nativo do Windows instala um ZIP real com subpastas', { skip: process.platform !== 'win32' }, async t => {
  const root = await fixture(t)
  const archive = path.join(root, 'real.zip')
  await writeStoredZip(archive, { version: '39.8.10', 'electron.exe': 'native-test-fixture', 'locales/pt-BR.pak': 'locale-fixture' })
  const hash = createHash('sha256').update(await fs.readFile(archive)).digest('hex')
  await fs.writeFile(path.join(root, 'checksums.json'), JSON.stringify({ 'electron-v39.8.10-win32-x64.zip': hash }))
  const progress: string[] = []
  const result = await restoreElectron(root, { archivePath: archive, platform: 'win32', arch: 'x64', log: (message: string) => progress.push(message) })
  assert.equal(result.ok, true)
  assert.equal(await fs.readFile(path.join(root, 'dist', 'locales', 'pt-BR.pak'), 'utf8'), 'locale-fixture')
  assert.ok(progress.some(message => message.includes('Extração:')))
})

test('cache corrompido é baixado novamente antes de extrair', async t => {
  const { root, archive, extract } = await archiveFixture(t)
  const corrupt = path.join(root, 'corrupt.zip')
  await fs.writeFile(corrupt, 'corrompido')
  const requests: boolean[] = []
  const result = await restoreElectron(root, {
    platform: 'win32', arch: 'x64', extract,
    downloadArtifact: async ({ force }: { force: boolean }) => { requests.push(force); return force ? archive : corrupt }
  })
  assert.equal(result.ok, true)
  assert.deepEqual(requests, [false, true])
})

test('cancelamento não registra uma instalação incompleta', async t => {
  const { root, archive } = await archiveFixture(t)
  const controller = new AbortController()
  await assert.rejects(restoreElectron(root, {
    platform: 'win32', arch: 'x64', archivePath: archive, signal: controller.signal,
    extract: async () => { controller.abort(new Error('Cancelado pelo usuário')) }
  }), /Cancelado pelo usuário/)
  assert.equal(inspectElectron(root, 'win32').ok, false)
})
