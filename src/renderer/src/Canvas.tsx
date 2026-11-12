import { forwardRef, lazy, Suspense, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, MainMenu, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles, DataURL } from '@excalidraw/excalidraw/types/types'
import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from '@excalidraw/excalidraw/element/types'
import { Code2, Pencil } from 'lucide-react'
import { isCodeData, renderCode, type CodeData } from './code'
import { serialize } from './projects'
import { useProjects, type ProjectTab } from './store'

const CodeDialog = lazy(() => import('./CodeDialog').then(module => ({ default: module.CodeDialog })))
export interface CanvasHandle { addCode(): void }

export const Canvas = forwardRef<CanvasHandle, { tab: ProjectTab; theme: 'light' | 'dark' }>(function Canvas({ tab, theme }, ref) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const [dialog, setDialog] = useState<{ elementId?: string; initial?: CodeData } | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const pointerCode = useRef<string | null>(null)
  const tabId = tab.id
  const initialScene = useRef(tab.scene)
  const firstChange = useRef(true)

  useImperativeHandle(ref, () => ({ addCode: () => setDialog({}) }), [])

  const editCode = useCallback((elementId: string) => {
    const element = api.current?.getSceneElements().find(item => item.id === elementId)
    if (element && isCodeData(element.customData)) setDialog({ elementId, initial: element.customData })
  }, [])

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    const scene = { elements, appState, files }
    if (firstChange.current) {
      firstChange.current = false
      useProjects.getState().patch(tabId, { scene, serialized: serialize(scene) })
    } else {
      useProjects.getState().update(tabId, scene, serialize(scene))
    }
    const selected = elements.filter(element => appState.selectedElementIds[element.id])
    setSelectedCode(selected.length === 1 && isCodeData(selected[0].customData) ? selected[0].id : null)
  }, [tabId])

  const insertCode = async (data: CodeData) => {
    const editor = api.current
    if (!editor) throw new Error('O canvas ainda está carregando.')
    const card = await renderCode(data)
    const fileId = crypto.randomUUID() as FileId
    const fileData = `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(card.svg), byte => String.fromCharCode(byte)).join(''))}` as DataURL
    const elements = editor.getSceneElements()
    const existing = elements.find(element => element.id === dialog?.elementId && element.type === 'image') as ExcalidrawImageElement | undefined
    editor.addFiles([{ id: fileId, dataURL: fileData, mimeType: 'image/svg+xml', created: Date.now(), lastRetrieved: Date.now() }])
    let element: ExcalidrawImageElement
    if (existing) {
      const ratio = existing.width / card.width
      element = { ...existing, fileId, height: card.height * ratio, customData: { ...data }, version: existing.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }
    } else {
      const state = editor.getAppState()
      const center = viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
      // Convert a base shape to obtain all Excalidraw bookkeeping fields.
      const [base] = convertToExcalidrawElements([{ type: 'rectangle', x: center.x - card.width / 2, y: center.y - card.height / 2, width: card.width, height: card.height }])
      element = { ...base, type: 'image', fileId, status: 'saved', scale: [1, 1], crop: null, customData: { ...data } } as ExcalidrawImageElement
    }
    editor.updateScene({
      elements: existing ? elements.map(item => item.id === existing.id ? element : item) : [...elements, element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
    editor.setActiveTool({ type: 'selection' })
  }

  return <div className="canvas-container" onDoubleClickCapture={event => {
    if (pointerCode.current) { event.preventDefault(); event.stopPropagation(); editCode(pointerCode.current) }
  }}>
    <Excalidraw
      excalidrawAPI={instance => { api.current = instance }}
      initialData={initialScene.current}
      onChange={onChange}
      onPointerDown={(_tool, state) => { pointerCode.current = state.hit.element && isCodeData(state.hit.element.customData) ? state.hit.element.id : null }}
      theme={theme}
      langCode="pt-BR"
      name={tab.title}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } } }}
      renderTopRightUI={() => <div className="canvas-actions">{selectedCode && <button className="canvas-button" onClick={() => editCode(selectedCode)}><Pencil size={15}/> Editar código</button>}<button className="canvas-button" onClick={() => setDialog({})}><Code2 size={16}/> Código</button></div>}
    >
      <MainMenu>
        <MainMenu.DefaultItems.Export/>
        <MainMenu.DefaultItems.SaveAsImage/>
        <MainMenu.DefaultItems.Help/>
        <MainMenu.DefaultItems.ClearCanvas/>
        <MainMenu.Separator/>
        <MainMenu.DefaultItems.ChangeCanvasBackground/>
      </MainMenu>
    </Excalidraw>
    {dialog && <Suspense fallback={<div className="loading-overlay">Carregando editor de código…</div>}><CodeDialog initial={dialog.initial} editing={!!dialog.elementId} onClose={() => setDialog(null)} onSave={insertCode}/></Suspense>}
  </div>
})
