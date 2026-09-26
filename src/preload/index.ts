import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { API_CHANNELS, EVENT_CHANNEL, channel, type PassVaultApi } from '../shared/api'
import type { AppEvent } from '../shared/types'

function group<G extends Exclude<keyof typeof API_CHANNELS, 'getState'>>(name: G) {
  const methods = API_CHANNELS[name] as readonly string[]
  return Object.freeze(
    Object.fromEntries(methods.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(channel(name, method), ...args)])),
  )
}

const api = {
  getState: () => ipcRenderer.invoke(API_CHANNELS.getState),
  onEvent: (listener: (event: AppEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: AppEvent) => listener(payload)
    ipcRenderer.on(EVENT_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(EVENT_CHANNEL, handler)
    }
  },
  vault: group('vault'),
  biometrics: group('biometrics'),
  folders: group('folders'),
  entries: group('entries'),
  generator: group('generator'),
  ssh: group('ssh'),
  importer: group('importer'),
  settings: group('settings'),
  window: group('window'),
} as unknown as PassVaultApi

contextBridge.exposeInMainWorld('passvault', Object.freeze(api))
