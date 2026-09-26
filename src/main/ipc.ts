import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { API_CHANNELS, channel } from '../shared/api'
import type { AppError, EntryInput, GeneratorOptions, KdfPreset, Settings } from '../shared/types'
import type { AppController } from './controller'
import { generateSecret } from './generator'
import { ImportError } from './import/errors'
import { suggestLocations } from './locations'
import { isTrustedSender } from './security'
import { estimateStrength } from './strength'
import { VaultFormatError } from './vault/format'
import { SessionError } from './vault/session'
import type { WindowManager } from './windows'

function toError(error: unknown): AppError {
  if (error instanceof SessionError) return { code: error.code, message: error.message }
  if (error instanceof VaultFormatError) {
    return { code: error.code === 'NOT_A_VAULT' ? 'INVALID' : error.code, message: error.message }
  }
  if (error instanceof ImportError) {
    return { code: error.code === 'WRONG_PASSWORD' ? 'WRONG_PASSWORD' : 'IMPORT', message: error.message }
  }
  const message = error instanceof Error && error.message ? error.message : 'Something went wrong.'
  return { code: 'IO', message }
}

const str = (value: unknown, max = 100_000): string => {
  if (typeof value !== 'string' || value.length > max) throw new SessionError('INVALID', 'Invalid input.')
  return value
}
const optStr = (value: unknown): string | null => (value === null || value === undefined ? null : str(value, 256))
const ids = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 10_000) throw new SessionError('INVALID', 'Invalid input.')
  return value.map((v) => str(v, 64))
}
const obj = <T>(value: unknown): T => {
  if (!value || typeof value !== 'object') throw new SessionError('INVALID', 'Invalid input.')
  return value as T
}
const preset = (value: unknown): KdfPreset => (value === 'strong' ? 'strong' : 'standard')

type Handler = (...args: unknown[]) => unknown

export function registerIpc(controller: AppController, windows: WindowManager, devUrl: string | undefined, onSettings: (next: Settings, previous: Settings) => void): void {
  const parent = (): BrowserWindow | undefined => windows.main ?? undefined

  // `result` handlers answer with Result<T>; the rest resolve or reject plainly.
  const handlers: Record<string, { fn: Handler; result: boolean }> = {}
  const on = (group: string, method: string, fn: Handler, result = true) => {
    handlers[channel(group, method)] = { fn, result }
  }

  // vault
  on('vault', 'suggestLocations', () => suggestLocations(), false)
  on(
    'vault',
    'chooseNewPath',
    async (input) => {
      const { name, directory } = obj<{ name: unknown; directory?: unknown }>(input)
      const safe = str(name, 200).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Vault'
      const options = {
        title: 'Create vault',
        defaultPath: join(typeof directory === 'string' ? directory : app.getPath('documents'), `${safe}.pvault`),
        filters: [{ name: 'PassVault vault', extensions: ['pvault'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'] as Array<'createDirectory' | 'showOverwriteConfirmation'>,
      }
      const win = parent()
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (picked.canceled || !picked.filePath) return null
      return picked.filePath.endsWith('.pvault') ? picked.filePath : `${picked.filePath}.pvault`
    },
    false,
  )
  on(
    'vault',
    'chooseExisting',
    async () => {
      const options = { title: 'Open vault', filters: [{ name: 'PassVault vault', extensions: ['pvault'] }], properties: ['openFile'] as Array<'openFile'> }
      const win = parent()
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return picked.canceled ? null : (picked.filePaths[0] ?? null)
    },
    false,
  )
  on('vault', 'inspect', (path) => controller.inspect(str(path, 4096)))
  on('vault', 'create', (input) => {
    const { path, name, password, kdf } = obj<Record<string, unknown>>(input)
    return controller.create({ path: str(path, 4096), name: str(name, 200), password: str(password, 4096), kdf: preset(kdf) })
  })
  on('vault', 'unlock', (input) => {
    const { path, password } = obj<Record<string, unknown>>(input)
    return controller.unlock(str(path, 4096), str(password, 4096))
  })
  on('vault', 'unlockWithBiometrics', (path) => controller.unlockWithBiometrics(str(path, 4096)))
  on('vault', 'lock', () => controller.lock('manual'), false)
  on('vault', 'index', () => controller.requireSession().index())
  on('vault', 'rename', (name) => controller.requireSession().rename(str(name, 200)))
  on('vault', 'changePassword', (input) => {
    const { current, next } = obj<Record<string, unknown>>(input)
    return controller.changePassword(str(current, 4096), str(next, 4096))
  })
  on('vault', 'setKdf', (input) => {
    const { preset: chosen, password } = obj<Record<string, unknown>>(input)
    return controller.setKdf(preset(chosen), str(password, 4096))
  })
  on('vault', 'forgetRecent', (path) => controller.settings.forgetRecent(str(path, 4096)), false)
  on('vault', 'showInFolder', () => shell.showItemInFolder(controller.requireSession().path), false)
  on('vault', 'estimateStrength', (password) => estimateStrength(str(password, 4096)), false)

  // biometrics
  on('biometrics', 'enroll', (password) => controller.enrollBiometrics(str(password, 4096)))
  on('biometrics', 'disenroll', () => controller.disenrollBiometrics(), false)

  // folders
  on('folders', 'create', (input) => {
    const { name, parentId } = obj<Record<string, unknown>>(input)
    return controller.requireSession().createFolder(str(name, 200), optStr(parentId))
  })
  on('folders', 'rename', (id, name) => controller.requireSession().renameFolder(str(id, 64), str(name, 200)))
  on('folders', 'move', (id, parentId) => controller.requireSession().moveFolder(str(id, 64), optStr(parentId)))
  on('folders', 'remove', (id) => controller.requireSession().removeFolder(str(id, 64)))

  // entries
  on('entries', 'get', (id) => controller.requireSession().detail(str(id, 64)))
  on('entries', 'create', (input) => controller.createEntry(obj<EntryInput>(input)))
  on('entries', 'update', (id, input) => controller.requireSession().updateEntry(str(id, 64), obj<EntryInput>(input)))
  on('entries', 'move', (list, folderId) => controller.requireSession().moveEntries(ids(list), optStr(folderId)))
  on('entries', 'setFavorite', (id, favorite) => controller.requireSession().setFavorite(str(id, 64), favorite === true))
  on('entries', 'trash', (list) => controller.requireSession().trash(ids(list)))
  on('entries', 'restore', (list) => controller.requireSession().restore(ids(list)))
  on('entries', 'purge', (list) => controller.requireSession().purge(ids(list)))
  on('entries', 'reveal', (id, ref) => controller.reveal(str(id, 64), str(ref, 80)))
  on('entries', 'copy', (id, ref) => controller.copy(str(id, 64), str(ref, 80)))
  on('entries', 'totp', (id) => controller.totp(str(id, 64)))
  on('entries', 'restoreVersion', (id, index) => controller.requireSession().restoreVersion(str(id, 64), Number(index)))

  // generator
  on('generator', 'generate', (options) => generateSecret(obj<GeneratorOptions>(options)), false)

  // ssh
  on('ssh', 'connect', async (id) => {
    try {
      return await controller.sshConnect(str(id, 64))
    } catch (error) {
      if (error instanceof SessionError) throw error
      throw new SessionError('SSH', error instanceof Error ? error.message : 'The connection could not be started.')
    }
  })
  on('ssh', 'copyCommand', (id) => controller.sshCopyCommand(str(id, 64)))
  on('ssh', 'addKey', async (id) => {
    try {
      return await controller.sshAddKey(str(id, 64))
    } catch (error) {
      if (error instanceof SessionError) throw error
      throw new SessionError('SSH', error instanceof Error ? error.message : 'The key could not be added.')
    }
  })

  // importer
  on(
    'importer',
    'chooseFile',
    async (kind) => {
      const keyfile = kind === 'keyfile'
      const options = {
        title: keyfile ? 'Choose key file' : 'Choose KeePass database',
        filters: keyfile
          ? [{ name: 'All files', extensions: ['*'] }]
          : [
              { name: 'KeePass database', extensions: ['kdbx', 'kdb'] },
              { name: 'KeePass 2 (.kdbx)', extensions: ['kdbx'] },
              { name: 'KeePass 1 (.kdb)', extensions: ['kdb'] },
            ],
        properties: ['openFile'] as Array<'openFile'>,
      }
      const win = parent()
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return picked.canceled ? null : (picked.filePaths[0] ?? null)
    },
    false,
  )
  on('importer', 'kdbx', (input) => {
    const { path, password, keyFilePath } = obj<Record<string, unknown>>(input)
    return controller.importKdbx({ path: str(path, 4096), password: str(password, 4096), keyFilePath: optStr(keyFilePath) ?? undefined })
  })

  // settings
  on(
    'settings',
    'update',
    (patch) => {
      const previous = controller.settings.settings
      const next = controller.updateSettings(obj<Partial<Settings>>(patch))
      onSettings(next, previous)
      return next
    },
    false,
  )

  // window
  on(
    'window',
    'openExternal',
    async (url) => {
      const target = str(url, 4096)
      if (/^https?:\/\//i.test(target)) await shell.openExternal(target)
    },
    false,
  )
  on('window', 'hideQuick', () => windows.hideQuick(), false)
  on('window', 'showMain', (id) => windows.showMain(optStr(id) ?? undefined), false)

  // Every channel in the contract must have a handler, and nothing else may be registered.
  const expected = new Set<string>([API_CHANNELS.getState])
  for (const [group, methods] of Object.entries(API_CHANNELS)) {
    if (Array.isArray(methods)) for (const method of methods) expected.add(channel(group, method))
  }
  for (const name of expected) {
    if (name !== API_CHANNELS.getState && !handlers[name]) throw new Error(`Missing IPC handler for ${name}`)
  }

  ipcMain.handle(API_CHANNELS.getState, (event) => {
    if (!isTrustedSender(event, devUrl)) throw new Error('Untrusted sender')
    return controller.state()
  })
  for (const [name, { fn, result }] of Object.entries(handlers)) {
    ipcMain.handle(name, async (event, ...args: unknown[]) => {
      if (!isTrustedSender(event, devUrl)) throw new Error('Untrusted sender')
      if (!result) return fn(...args)
      try {
        const value = await fn(...args)
        return { ok: true, value: value ?? null }
      } catch (error) {
        return { ok: false, error: toError(error) }
      }
    })
  }
}
