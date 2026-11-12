import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useProjects, type Scene } from '../src/renderer/src/store.ts'

test('ecos do canvas não notificam o React e mover a vista não suja o arquivo', () => {
  const scene: Scene = { elements: [], appState: { scrollX: 0 }, files: {} }
  const id = 'canvas-regression'
  useProjects.getState().add({ id, title: 'Teste', scene, serialized: 'A', revision: 0, savedRevision: 0, saving: false })
  let notifications = 0
  const unsubscribe = useProjects.subscribe(() => notifications++)
  try {
    for (let i = 0; i < 100; i++) {
      useProjects.getState().update(id, { ...scene, appState: { ...scene.appState } }, 'A')
    }
    assert.equal(notifications, 0)
    useProjects.getState().update(id, { ...scene, appState: { scrollX: 5 } }, 'A')
    assert.equal(notifications, 1)
    assert.equal(useProjects.getState().tabs[0].revision, 0)
    useProjects.getState().update(id, scene, 'B')
    assert.equal(useProjects.getState().tabs[0].revision, 1)
  } finally {
    unsubscribe()
    useProjects.getState().remove(id)
  }
})
