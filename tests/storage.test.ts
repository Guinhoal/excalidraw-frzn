import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { atomicWrite, authorizeWorkspaceFile, createProject, readTree, safeTitle } from '../src/main/storage.ts'
import { validateScene } from '../src/shared/scene.ts'

test('novos projetos concorrentes recebem nomes únicos sem sobrescrever conteúdo', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const paths = await Promise.all(Array.from({ length: 8 }, (_, index) => createProject(root, 'Meu projeto', String(index))))
  assert.equal(new Set(paths).size, 8)
  const contents = await Promise.all(paths.map(file => fs.readFile(file, 'utf8')))
  assert.deepEqual(new Set(contents), new Set(['0', '1', '2', '3', '4', '5', '6', '7']))
})

test('gravação substitui o arquivo e remove o temporário', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'teste.excalidraw')
  await fs.writeFile(file, 'anterior')
  await atomicWrite(file, 'novo conteúdo com acentuação')
  assert.equal(await fs.readFile(file, 'utf8'), 'novo conteúdo com acentuação')
  assert.deepEqual(await fs.readdir(root), ['teste.excalidraw'])
})

test('falha ao gravar não danifica outros projetos e limpa temporários', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'preservado.excalidraw')
  await fs.writeFile(file, 'original')
  await fs.mkdir(path.join(root, 'destino.excalidraw'))
  await assert.rejects(() => atomicWrite(path.join(root, 'destino.excalidraw'), 'novo'))
  assert.equal(await fs.readFile(file, 'utf8'), 'original')
  assert.equal((await fs.readdir(root)).some(file => file.endsWith('.tmp')), false)
})

test('listagem mantém subpastas e filtra arquivos que não são desenhos', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'Arquitetura'))
  await fs.writeFile(path.join(root, 'Arquitetura', 'API.excalidraw'), '{}')
  await fs.writeFile(path.join(root, 'rascunho.EXCALIDRAW'), '{}')
  await fs.writeFile(path.join(root, 'segredo.txt'), 'não listar')
  const tree = await readTree(root)
  assert.equal(tree.length, 2)
  assert.equal(tree[0].kind, 'folder')
  assert.equal(tree[0].children?.[0].name, 'API.excalidraw')
})

test('acesso a arquivos fora do workspace é rejeitado', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-test-'))
  t.after(() => fs.rm(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'workspace')
  await fs.mkdir(root)
  const inside = path.join(root, 'interno.excalidraw')
  const outside = path.join(parent, 'externo.excalidraw')
  await fs.writeFile(inside, '{}'); await fs.writeFile(outside, '{}')
  assert.equal(await authorizeWorkspaceFile(root, inside), await fs.realpath(inside))
  await assert.rejects(() => authorizeWorkspaceFile(root, outside), /não pertence/)
  await assert.rejects(() => authorizeWorkspaceFile(root, path.join(root, '..', 'externo.excalidraw')), /não pertence/)
})

test('nomes do Windows e tentativas de travessia de pasta são normalizados', () => {
  assert.equal(safeTitle('CON'), 'Sem título')
  assert.equal(safeTitle('NUL.excalidraw'), 'Sem título')
  assert.equal(safeTitle('  Ideias.excalidraw '), 'Ideias.excalidraw')
  assert.equal(/[\\/<>:"|?*]/.test(safeTitle('../../teste:abc')), false)
})

test('validação rejeita JSON inválido e preserva imagens e metadados de código', () => {
  assert.throws(() => validateScene('não é JSON'))
  for (const value of [null, {}, { type: 'excalidraw', elements: 'errado', appState: {} }, { type: 'excalidraw', elements: [], appState: {}, files: [] }]) assert.throws(() => validateScene(JSON.stringify(value)))
  const scene = { type: 'excalidraw', elements: [{ type: 'image', fileId: 'abc', customData: { type: 'frzn-code-block', rawCode: 'console.log("Olá")', language: 'javascript' } }], appState: {}, files: { abc: { dataURL: 'data:image/svg+xml;base64,abc' } } }
  assert.doesNotThrow(() => validateScene(JSON.stringify(scene)))
})
