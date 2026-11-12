import './font-path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@excalidraw/excalidraw/index.css'
import './styles.css'

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() {
    if (this.state.error) return <div className="fatal"><h1>O editor encontrou um problema</h1><p>{this.state.error}</p><p>Seus arquivos salvos continuam na pasta de projetos. Reinicie o aplicativo para recuperá-los.</p></div>
    return this.props.children
  }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
