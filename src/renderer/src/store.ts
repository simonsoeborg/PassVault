import { useSyncExternalStore } from 'react'
import type { AppCommand, AppError, AppEvent, AppState, FolderView, Result, VaultIndex } from '../../shared/types'

export class AppFailure extends Error {
  readonly code: AppError['code']
  constructor(error: AppError) {
    super(error.message)
    this.code = error.code
  }
}

export async function unwrap<T>(pending: Promise<Result<T>>): Promise<T> {
  const result = await pending
  if (!result.ok) throw new AppFailure(result.error)
  return result.value
}

export const api = () => window.passvault

export interface ClipboardReceipt {
  label: string
  clearsAt: number | null
  at: number
}

export interface Notice {
  id: number
  text: string
  tone: 'plain' | 'alert'
  action?: { label: string; run: () => void }
}

interface State {
  app: AppState | null
  index: VaultIndex | null
  clipboard: ClipboardReceipt | null
  notice: Notice | null
  /** Keeps the unlock screen up for the registration moment after a successful unlock. */
  gateHold: boolean
}

let state: State = { app: null, index: null, clipboard: null, notice: null, gateHold: false }

export function setGateHold(gateHold: boolean) {
  set({ gateHold })
}
const listeners = new Set<() => void>()
const commandListeners = new Set<(command: AppCommand | { focus: string }) => void>()
const entryListeners = new Set<(id: string) => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => select(state),
  )
}

export const getState = () => state

let indexTimer: ReturnType<typeof setTimeout> | null = null

export async function refreshIndex(): Promise<void> {
  const result = await api().vault.index()
  if (result.ok) set({ index: result.value })
}

function scheduleIndex() {
  if (indexTimer) clearTimeout(indexTimer)
  indexTimer = setTimeout(() => {
    indexTimer = null
    void refreshIndex()
  }, 40)
}

export async function refreshApp(): Promise<void> {
  set({ app: await api().getState() })
}

let noticeId = 0
export function notify(text: string, tone: Notice['tone'] = 'plain', action?: Notice['action']) {
  set({ notice: { id: ++noticeId, text, tone, action } })
}

export function dismissNotice(id: number) {
  if (state.notice?.id === id) set({ notice: null })
}

export function onCommand(listener: (command: AppCommand | { focus: string }) => void): () => void {
  commandListeners.add(listener)
  return () => commandListeners.delete(listener)
}

export function onEntryChanged(listener: (id: string) => void): () => void {
  entryListeners.add(listener)
  return () => entryListeners.delete(listener)
}

function handle(event: AppEvent) {
  switch (event.type) {
    case 'unlocked':
      void refreshApp().then(refreshIndex)
      break
    case 'locked':
      set({ index: null, clipboard: null, app: state.app ? { ...state.app, locked: true, vault: null } : null })
      break
    case 'index-changed':
      scheduleIndex()
      break
    case 'entry-changed':
      for (const listener of entryListeners) listener(event.id)
      break
    case 'sync':
      if (state.app) set({ app: { ...state.app, sync: event.status, vault: state.app.vault } })
      if (event.status.state === 'merged' && event.status.detail) notify(event.status.detail)
      if (event.status.state === 'saved' && state.app?.vault) void refreshApp()
      break
    case 'clipboard':
      set({ clipboard: event.state === 'copied' ? { label: event.label ?? 'Value', clearsAt: event.clearsAt ?? null, at: Date.now() } : null })
      break
    case 'settings':
      if (state.app) set({ app: { ...state.app, settings: event.settings } })
      break
    case 'command':
      for (const listener of commandListeners) listener(event.command)
      break
    case 'focus-entry':
      for (const listener of commandListeners) listener({ focus: event.id })
      break
    case 'quick-shown':
      for (const listener of commandListeners) listener('search')
      break
  }
}

let booted = false
export async function boot(): Promise<void> {
  if (booted) return
  booted = true
  api().onEvent(handle)
  await refreshApp()
  if (state.app && !state.app.locked) await refreshIndex()
}

// ---------------------------------------------------------------- selectors

export function folderPath(folders: FolderView[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: string[] = []
  let cursor = id ? byId.get(id) : undefined
  let guard = 0
  while (cursor && guard++ < 64) {
    path.unshift(cursor.name)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return path
}

