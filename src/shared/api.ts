// The contract between the renderer and the main process. The preload script
// exposes exactly this object as `window.passvault`; nothing else crosses over.

import type {
  AppEvent,
  AppState,
  CopyReceipt,
  EntryDetail,
  EntryInput,
  FieldRef,
  GeneratedSecret,
  GeneratorOptions,
  ImportReport,
  ImportInput,
  KdfPreset,
  QuickUnlockState,
  Result,
  Settings,
  StrengthEstimate,
  SyncLocation,
  TotpCode,
  VaultFileInfo,
  VaultIndex,
  VaultInfo,
} from './types'

export interface PassVaultApi {
  getState(): Promise<AppState>
  onEvent(listener: (event: AppEvent) => void): () => void

  vault: {
    suggestLocations(): Promise<SyncLocation[]>
    chooseNewPath(input: { name: string; directory?: string }): Promise<string | null>
    chooseExisting(): Promise<string | null>
    inspect(path: string): Promise<Result<VaultFileInfo>>
    create(input: { path: string; name: string; password: string; kdf: KdfPreset }): Promise<Result<VaultInfo>>
    unlock(input: { path: string; password: string }): Promise<Result<VaultInfo>>
    unlockWithBiometrics(path: string): Promise<Result<VaultInfo>>
    lock(): Promise<void>
    index(): Promise<Result<VaultIndex>>
    rename(name: string): Promise<Result<void>>
    changePassword(input: { current: string; next: string }): Promise<Result<VaultInfo>>
    setKdf(input: { preset: KdfPreset; password: string }): Promise<Result<VaultInfo>>
    forgetRecent(path: string): Promise<void>
    showInFolder(): Promise<void>
    estimateStrength(password: string): Promise<StrengthEstimate>
  }

  biometrics: {
    enroll(password: string): Promise<Result<QuickUnlockState>>
    disenroll(): Promise<void>
  }

  folders: {
    create(input: { name: string; parentId: string | null }): Promise<Result<string>>
    rename(id: string, name: string): Promise<Result<void>>
    move(id: string, parentId: string | null): Promise<Result<void>>
    remove(id: string): Promise<Result<void>>
  }

  entries: {
    get(id: string): Promise<Result<EntryDetail>>
    create(input: EntryInput): Promise<Result<string>>
    update(id: string, input: EntryInput): Promise<Result<void>>
    move(ids: string[], folderId: string | null): Promise<Result<void>>
    setFavorite(id: string, favorite: boolean): Promise<Result<void>>
    trash(ids: string[]): Promise<Result<void>>
    restore(ids: string[]): Promise<Result<void>>
    purge(ids: string[]): Promise<Result<void>>
    reveal(id: string, field: FieldRef): Promise<Result<string>>
    copy(id: string, field: FieldRef): Promise<Result<CopyReceipt>>
    totp(id: string): Promise<Result<TotpCode | null>>
    restoreVersion(id: string, index: number): Promise<Result<void>>
  }

  generator: {
    generate(options: GeneratorOptions): Promise<GeneratedSecret>
  }

  ssh: {
    connect(id: string): Promise<Result<{ copiedPassword: boolean; addedKey: boolean; terminal: string }>>
    copyCommand(id: string): Promise<Result<CopyReceipt>>
    addKey(id: string): Promise<Result<{ lifetimeMinutes: number }>>
  }

  importer: {
    chooseFile(kind: 'kdbx' | 'keyfile'): Promise<string | null>
    kdbx(input: ImportInput): Promise<Result<ImportReport>>
  }

  settings: {
    update(patch: Partial<Settings>): Promise<Settings>
  }

  window: {
    openExternal(url: string): Promise<void>
    hideQuick(): Promise<void>
    showMain(entryId?: string): Promise<void>
  }
}

/** Every invokable method, flattened to "group.method" channel names. */
export const API_CHANNELS = {
  getState: 'pv:getState',
  vault: [
    'suggestLocations',
    'chooseNewPath',
    'chooseExisting',
    'inspect',
    'create',
    'unlock',
    'unlockWithBiometrics',
    'lock',
    'index',
    'rename',
    'changePassword',
    'setKdf',
    'forgetRecent',
    'showInFolder',
    'estimateStrength',
  ],
  biometrics: ['enroll', 'disenroll'],
  folders: ['create', 'rename', 'move', 'remove'],
  entries: ['get', 'create', 'update', 'move', 'setFavorite', 'trash', 'restore', 'purge', 'reveal', 'copy', 'totp', 'restoreVersion'],
  generator: ['generate'],
  ssh: ['connect', 'copyCommand', 'addKey'],
  importer: ['chooseFile', 'kdbx'],
  settings: ['update'],
  window: ['openExternal', 'hideQuick', 'showMain'],
} as const

export const EVENT_CHANNEL = 'pv:event'

export function channel(group: string, method: string): string {
  return `pv:${group}.${method}`
}
