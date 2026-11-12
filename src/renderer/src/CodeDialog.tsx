import { useEffect, useRef, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { Code2, X } from 'lucide-react'
import { languages, type CodeData, type CodeLanguage } from './code'

window.MonacoEnvironment = {
  getWorker: (_id, label) => {
    if (label === 'json') return new JsonWorker()
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
    if (['typescript', 'javascript'].includes(label)) return new TsWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

export function CodeDialog({ initial, editing, onClose, onSave }: {
  initial?: CodeData; editing: boolean; onClose(): void; onSave(data: CodeData): Promise<void>
}) {
  const [code, setCode] = useState(initial?.rawCode ?? 'const projeto = {\n  nome: "Excalidraw FRZN",\n  ideias: "sem limites"\n};')
  const [language, setLanguage] = useState<CodeLanguage>(initial?.language || 'typescript')
  const [title, setTitle] = useState(initial?.title || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const save = async () => {
    setBusy(true); setError('')
    try { await onSave({ type: 'frzn-code-block', rawCode: code, language, title }); onClose() }
    catch (err) { setError(String(err)); setBusy(false) }
  }
  return <dialog ref={dialog} className="code-dialog" onCancel={event => { if (busy) event.preventDefault(); else onClose() }} aria-labelledby="code-heading">
    <div className="dialog-heading"><span className="code-icon"><Code2 size={20}/></span><div><h2 id="code-heading">{editing ? 'Editar bloco de código' : 'Novo bloco de código'}</h2><p>Seu código faz parte do desenho. Edite quando precisar.</p></div><button className="icon-button" aria-label="Fechar editor de código" onClick={onClose} disabled={busy}><X size={18}/></button></div>
    <div className="code-options"><label>Nome do bloco<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: api.ts" maxLength={80}/></label><label>Linguagem<select value={language} onChange={event => setLanguage(event.target.value as CodeLanguage)}>{languages.map(lang => <option key={lang}>{lang}</option>)}</select></label></div>
    <div className="monaco-container"><Editor height="100%" language={language === 'text' ? 'plaintext' : language} theme="vs-dark" value={code} onChange={value => setCode(value || '')} loading={<span className="editor-loading">Carregando editor local…</span>} options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: '"Geist Mono", Consolas, monospace', padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on', tabSize: 4 }}/></div>
    {error && <p className="dialog-error" role="alert">{error}</p>}
    <div className="dialog-footer"><span>{code.split('\n').length} linhas <span className="muted">· Até 300 por bloco</span></span><div><button className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy || !code.trim()} onClick={() => void save()}>{busy ? 'Preparando…' : editing ? 'Atualizar bloco' : 'Inserir no canvas'}</button></div></div>
  </dialog>
}
