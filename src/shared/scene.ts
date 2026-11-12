export const MAX_SCENE_BYTES = 100 * 1024 * 1024

export function validateScene(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_SCENE_BYTES) {
    throw new Error('O projeto excede o limite de 100 MB.')
  }
  const value = JSON.parse(content)
  if (!value || value.type !== 'excalidraw' || !Array.isArray(value.elements) ||
      !value.appState || typeof value.appState !== 'object' ||
      (value.files !== undefined && (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)))) {
    throw new Error('Este arquivo não é um projeto .excalidraw válido.')
  }
}
