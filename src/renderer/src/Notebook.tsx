import { useRef, useState } from 'react'
import { AlignLeft, List, Maximize2, Minimize2, Type } from 'lucide-react'
import { useProjects, type ProjectTab } from './store'

export function noteTemplate(key: string, title: string): string {
  const sections: Record<string, string[]> = {
    adr: ['Contexto', 'Alternativas consideradas', 'Decisão', 'Consequências'],
    api: ['Objetivo', 'Endpoint e autenticação', 'Requisição', 'Resposta', 'Erros'],
    incident: ['Impacto', 'Linha do tempo', 'Causa', 'Recuperação', 'Ações de acompanhamento']
  }
  return sections[key] ? `# ${title}\n\n${sections[key].map(s => `## ${s}\n\n`).join('')}` : ''
}

export function Notebook({ tab, fullscreen, onFullscreen }: { tab: ProjectTab; fullscreen: boolean; onFullscreen(): void }) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const [mono, setMono] = useState(false)
  const [outline, setOutline] = useState(true)
  const bom = tab.serialized.startsWith('\uFEFF') ? '\uFEFF' : ''
  const content = tab.serialized.slice(bom.length).replace(/\r\n/g, '\n')
  const lines = content.split('\n')
  const headings: { label: string; offset: number; level: number }[] = []
  let offset = 0
  let fence = ''
  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker && !fence) fence = marker
    else if (marker && marker.startsWith(fence) && !line.trim().slice(marker.length)) fence = ''
    else if (!fence) {
      const match = /^(#{1,6})\s+(.+)/.exec(line)
      if (match) headings.push({ label: match[2], offset, level: match[1].length })
    }
    offset += line.length + 1
  }
  function goTo(position: number) {
    const area = editor.current
    if (!area) return
    area.focus()
    area.setSelectionRange(position, position)
    // Moving the caret using the native selection reveals it, including on wrapped lines.
    const before = area.value.slice(0, position)
    const mirror = area.cloneNode(false) as HTMLTextAreaElement
    mirror.setAttribute('aria-hidden', 'true')
    mirror.style.cssText += `;position:absolute;visibility:hidden;width:${area.offsetWidth}px;height:0;min-height:0;`
    area.parentElement?.appendChild(mirror)
    mirror.value = before
    area.scrollTop = Math.max(0, mirror.scrollHeight - 80)
    mirror.remove()
  }
  return <section className="notebook" aria-label="Bloco de notas">
    <div className="notebook-tools">
      <span>{tab.format === 'txt' ? 'Texto simples' : 'Markdown'}</span>
      <div>
        <button title="Fonte monoespaçada" aria-label="Fonte monoespaçada" aria-pressed={mono} onClick={() => setMono(!mono)}><Type size={16}/></button>
        {tab.format === 'md' && <button title="Índice da nota" aria-label="Índice da nota" aria-pressed={outline} onClick={() => setOutline(!outline)}><List size={16}/></button>}
        <button title={fullscreen ? 'Sair da tela cheia' : 'Ampliar nota'} aria-label={fullscreen ? 'Sair da tela cheia' : 'Ampliar nota'} onClick={onFullscreen}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
      </div>
    </div>
    <div className="notebook-body">
      <textarea ref={editor} aria-label="Conteúdo da anotação" className={mono ? 'mono' : ''} spellCheck={!mono}
        placeholder="Comece a escrever…" value={content} onChange={e => {
          const value = tab.serialized.includes('\r\n') ? e.target.value.replace(/\n/g, '\r\n') : e.target.value
          useProjects.getState().patch(tab.id, { serialized: bom + value, revision: tab.revision + 1, error: undefined })
        }}/>
      {tab.format === 'md' && outline && headings.length > 0 && <nav className="note-outline" aria-label="Seções da nota"><strong><AlignLeft size={15}/> Nesta nota</strong>
        {headings.map(h => <button key={h.offset} style={{ paddingLeft: Math.min(h.level, 4) * 8 }} onClick={() => goTo(h.offset)}>{h.label}</button>)}
      </nav>}
    </div>
    <footer>{lines.length} {lines.length === 1 ? 'linha' : 'linhas'} · {content.trim() ? content.trim().split(/\s+/).length : 0} palavras</footer>
  </section>
}
