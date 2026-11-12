import type { DesktopAPI } from '../../shared/contracts'
declare global {
  interface Window {
    desktop: DesktopAPI
    EXCALIDRAW_ASSET_PATH: string
    MonacoEnvironment: { getWorker: (_moduleId: string, label: string) => Worker }
  }
}
export {}
