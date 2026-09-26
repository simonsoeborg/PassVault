// Electron hardening. The renderer is treated as untrusted: it can reach nothing
// but its own bundle and the IPC contract, and it can never navigate elsewhere.

import { app, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const rendererDir = () => join(__dirname, '..', 'renderer')

function isRendererFile(url: string): boolean {
  if (!url.startsWith('file://')) return false
  try {
    return fileURLToPath(url).startsWith(rendererDir() + sep)
  } catch {
    return false
  }
}

export function isAppUrl(url: string, devUrl?: string): boolean {
  if (devUrl) return url === devUrl || url.startsWith(`${devUrl}/`)
  return isRendererFile(url)
}

export function isTrustedSender(event: IpcMainInvokeEvent, devUrl?: string): boolean {
  const url = event.senderFrame?.url
  return Boolean(url && isAppUrl(url, devUrl))
}

export function hardenApp(devUrl?: string): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, devUrl)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url, devUrl)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

export function hardenSession(devUrl?: string): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.setSpellCheckerEnabled(false)
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details
    const allowed =
      isRendererFile(url) ||
      url.startsWith('devtools://') ||
      url.startsWith('data:') ||
      (devUrl !== undefined && (url.startsWith(devUrl) || /^wss?:\/\/localhost(:\d+)?\//.test(url)))
    callback({ cancel: !allowed })
  })
}
