// Application state that outlives a single window: the unlocked session, device
// settings, quick unlock, and the clipboard.

import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  isSecretField,
  type AppEvent,
  type AppState,
  type CopyReceipt,
  type EntryInput,
  type FieldRef,
  type ImportReport,
  type ImportInput,
  type KdfPreset,
  type LockReason,
  type QuickUnlockState,
  type Settings,
  type SyncStatus,
  type TotpCode,
  type VaultFileInfo,
  type VaultInfo,
} from '../shared/types'
import { getBiometricInfo, verifyUser } from './biometrics'
import { ClipboardGuard } from './clipboard'
import { importDatabase } from './import'
import { QuickUnlockStore } from './quickUnlock'
import { SettingsStore } from './settings'
import { addKeyToAgent } from './ssh/agent'
import { buildSsh } from './ssh/command'
import { launchSsh } from './ssh/terminal'
import { parseTotp, totp } from './totp'
import { wipe } from './vault/crypto'
import { VaultFormatError, kdfFingerprint, vaultIdHex } from './vault/format'
import { fieldLabel, newId, sshCommandParts } from './vault/model'
import { SessionError, VaultSession, type SessionListener } from './vault/session'

export class AppController {
  readonly settings = new SettingsStore()
  readonly quick = new QuickUnlockStore()
  readonly clipboard: ClipboardGuard
  private session: VaultSession | null = null
  private sync: SyncStatus = { state: 'idle', at: null }
  private locking: Promise<void> | null = null

  constructor(
    private readonly broadcast: (event: AppEvent) => void,
    private readonly afterLock: () => void,
  ) {
    this.clipboard = new ClipboardGuard((state, label, clearsAt) => broadcast({ type: 'clipboard', state, label, clearsAt }))
  }

  get unlocked(): boolean {
    return this.session !== null
  }

  async state(): Promise<AppState> {
    const recent = this.settings.recent
    return {
      platform: process.platform as AppState['platform'],
      locked: !this.session,
      vault: this.session?.info ?? null,
      recent,
      settings: this.settings.settings,
      biometrics: await getBiometricInfo(),
      quickUnlock: this.quick.all(recent.map((r) => r.vaultId)),
      sync: this.sync,
    }
  }

  // ---------------------------------------------------------------- unlock / lock

  private sessionOptions() {
    const listener: SessionListener = {
      indexChanged: () => this.broadcast({ type: 'index-changed' }),
      entryChanged: (id) => this.broadcast({ type: 'entry-changed', id }),
      sync: (status) => {
        this.sync = status
        this.broadcast({ type: 'sync', status })
      },
      keyChanged: () => void this.lock('password-changed-elsewhere'),
    }
    return { listener, recoveryDir: join(app.getPath('userData'), 'recovery') }
  }

  private async adopt(session: VaultSession): Promise<VaultInfo> {
    const previous = this.session
    this.session = session
    if (previous && previous !== session) await previous.close()
    const info = session.info
    this.sync = { state: 'saved', at: info.lastSavedAt }
    this.settings.touchRecent({ path: session.path, name: info.name, vaultId: session.vaultId })
    this.broadcast({ type: 'unlocked', vault: info })
    return info
  }

  requireSession(): VaultSession {
    if (!this.session) throw new SessionError('LOCKED', 'The vault is locked.')
    return this.session
  }

  async inspect(path: string): Promise<VaultFileInfo> {
    const { header, sizeBytes, modifiedAt } = await VaultSession.inspect(path)
    return {
      path,
      fileName: basename(path),
      vaultId: vaultIdHex(header.vaultId),
      kdf: { algorithm: 'argon2id', memoryKiB: header.kdf.memoryKiB, iterations: header.kdf.iterations, parallelism: header.kdf.parallelism },
      formatVersion: header.version,
      sizeBytes,
      modifiedAt,
    }
  }

  async create(input: { path: string; name: string; password: string; kdf: KdfPreset }): Promise<VaultInfo> {
    if (input.password.length < 8) throw new SessionError('INVALID', 'Use a master password of at least 8 characters.')
    const session = await VaultSession.create({ ...input, preset: input.kdf, ...this.sessionOptions() })
    return this.adopt(session)
  }

  async unlock(path: string, password: string): Promise<VaultInfo> {
    return this.adopt(await VaultSession.open({ path, password, ...this.sessionOptions() }))
  }

  async unlockWithBiometrics(path: string): Promise<VaultInfo> {
    const { header } = await VaultSession.inspect(path)
    const vaultId = vaultIdHex(header.vaultId)
    if (!this.quick.state(vaultId).enrolled) {
      throw new SessionError('NOT_ENROLLED', 'Biometric unlock is not set up for this vault on this device.')
    }
    const name = this.settings.recent.find((r) => r.vaultId === vaultId)?.name ?? 'your vault'
    const outcome = await verifyUser(`unlock “${name}”`)
    if (outcome === 'cancelled') throw new SessionError('BIOMETRIC_CANCELLED', 'Unlock was cancelled.')
    if (outcome === 'failed') throw new SessionError('BIOMETRIC_CANCELLED', 'Not recognized. Try again, or use your master password.')
    if (outcome === 'unavailable') throw new SessionError('BIOMETRIC_UNAVAILABLE', 'Biometrics are not available right now. Use your master password.')

    const retrieval = await this.quick.retrieve(vaultId, kdfFingerprint(header.kdf))
    if (!retrieval.ok) {
      const messages = {
        missing: 'Biometric unlock is not set up for this vault on this device.',
        expired: 'Biometric unlock has expired. Enter your master password to renew it.',
        changed: 'The master password changed since biometric unlock was set up. Enter the new password.',
        unavailable: 'The system keystore could not release the key. Enter your master password.',
      }
      throw new SessionError('BIOMETRIC_EXPIRED', messages[retrieval.reason])
    }
    try {
      return await this.adopt(await VaultSession.openWithKey({ path, rootKey: retrieval.key, ...this.sessionOptions() }))
    } catch (error) {
      if (error instanceof VaultFormatError && error.code === 'WRONG_PASSWORD') {
        await this.quick.remove(vaultId)
        throw new SessionError('BIOMETRIC_EXPIRED', 'The vault key changed. Enter your master password.')
      }
      throw error
    }
  }

  lock(reason: LockReason): Promise<void> {
    if (this.locking) return this.locking
    const session = this.session
    if (!session) return Promise.resolve()
    this.locking = (async () => {
      this.session = null
      this.clipboard.clearIfOurs()
      await session.close()
      this.sync = { state: 'idle', at: null }
      this.broadcast({ type: 'locked', reason })
      this.afterLock()
    })().finally(() => {
      this.locking = null
    })
    return this.locking
  }

  // ---------------------------------------------------------------- keys & biometrics

  async enrollBiometrics(password: string): Promise<QuickUnlockState> {
    const session = this.requireSession()
    const info = await getBiometricInfo(true)
    if (!info.available) throw new SessionError('BIOMETRIC_UNAVAILABLE', info.reason ?? 'Biometrics are not available on this device.')
    if (!(await session.verifyPassword(password))) throw new SessionError('WRONG_PASSWORD', 'That master password is not right.')
    const outcome = await verifyUser('turn on biometric unlock')
    if (outcome !== 'verified') throw new SessionError('BIOMETRIC_CANCELLED', 'The biometric check was not completed.')
    const key = session.rootKeyCopy()
    try {
      const { quickUnlockMode, quickUnlockDays } = this.settings.settings
      return await this.quick.enroll(session.vaultId, key, session.kdfFingerprint, quickUnlockMode, quickUnlockDays)
    } finally {
      wipe(key)
    }
  }

  async disenrollBiometrics(): Promise<void> {
    if (this.session) await this.quick.remove(this.session.vaultId)
  }

  async changePassword(current: string, next: string): Promise<VaultInfo> {
    if (next.length < 8) throw new SessionError('INVALID', 'Use a master password of at least 8 characters.')
    const session = this.requireSession()
    await session.changeKey(current, next)
    await this.quick.remove(session.vaultId)
    return session.info
  }

  async setKdf(preset: KdfPreset, password: string): Promise<VaultInfo> {
    const session = this.requireSession()
    await session.changeKey(password, password, preset)
    await this.quick.remove(session.vaultId)
    return session.info
  }

  // ---------------------------------------------------------------- secrets

  reveal(id: string, ref: FieldRef): string {
    return this.requireSession().readField(id, ref)
  }

  copy(id: string, ref: FieldRef): CopyReceipt {
    const session = this.requireSession()
    const entry = session.entry(id)
    const clearSeconds = this.settings.settings.clipboardClearSeconds
    if (ref === 'totp') {
      const code = this.totp(id)
      if (!code) throw new SessionError('INVALID', 'This entry has no valid one-time code.')
      return { clearsAt: this.clipboard.copy(code.code, 'One-time code', clearSeconds) }
    }
    const value = session.readField(id, ref)
    if (!value) throw new SessionError('INVALID', `${fieldLabel(entry, ref)} is empty on this entry.`)
    const secret =
      (ref.startsWith('custom:') && entry.custom.find((c) => c.id === ref.slice(7))?.secret) ||
      isSecretField(entry.type, ref) ||
      (entry.type === 'note' && ref === 'body')
    return { clearsAt: this.clipboard.copy(value, fieldLabel(entry, ref), secret ? clearSeconds : 0) }
  }

  totp(id: string): TotpCode | null {
    const entry = this.requireSession().entry(id)
    const source = entry.type === 'login' ? entry.fields.totp : undefined
    if (!source) return null
    try {
      return totp(parseTotp(source))
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------- ssh

  async sshConnect(id: string): Promise<{ copiedPassword: boolean; addedKey: boolean; terminal: string }> {
    const entry = this.requireSession().entry(id)
    if (entry.type !== 'ssh') throw new SessionError('INVALID', 'This entry is not an SSH connection.')
    const built = buildSsh(sshCommandParts(entry))
    if (!built.ok) throw new SessionError('SSH', built.error)
    const settings = this.settings.settings
    const auth = entry.fields.auth || (entry.fields.privateKey ? 'key' : entry.fields.password ? 'password' : 'agent')
    let addedKey = false
    let copiedPassword = false
    if (auth === 'key' && entry.fields.privateKey) {
      await addKeyToAgent(entry.fields.privateKey, entry.fields.keyPassphrase || undefined, settings.sshAgentLifetimeMinutes)
      addedKey = true
    }
    if (auth === 'password' && entry.fields.password) {
      this.clipboard.copy(entry.fields.password, 'SSH password', settings.clipboardClearSeconds)
      copiedPassword = true
    }
    const { terminal } = await launchSsh(built.args, settings.terminal)
    return { copiedPassword, addedKey, terminal }
  }

  sshCopyCommand(id: string): CopyReceipt {
    const entry = this.requireSession().entry(id)
    const built = buildSsh(sshCommandParts(entry))
    if (!built.ok) throw new SessionError('SSH', built.error)
    return { clearsAt: this.clipboard.copy(built.display, 'ssh command', 0) }
  }

  async sshAddKey(id: string): Promise<{ lifetimeMinutes: number }> {
    const entry = this.requireSession().entry(id)
    if (!entry.fields.privateKey) throw new SessionError('SSH', 'This entry has no private key.')
    const lifetimeMinutes = this.settings.settings.sshAgentLifetimeMinutes
    await addKeyToAgent(entry.fields.privateKey, entry.fields.keyPassphrase || undefined, lifetimeMinutes)
    return { lifetimeMinutes }
  }

  // ---------------------------------------------------------------- misc

  async importKdbx(input: ImportInput): Promise<ImportReport> {
    const session = this.requireSession()
    const file = new Uint8Array(await readFile(input.path))
    const keyFile = input.keyFilePath ? new Uint8Array(await readFile(input.keyFilePath)) : undefined
    const now = Date.now()
    const rootFolderId = newId()
    const result = await importDatabase({ file, password: input.password, keyFile, rootFolderId, now, newId })
    const folderName = `KeePass · ${basename(input.path, extname(input.path))}`.slice(0, 200)
    session.addImported([{ id: rootFolderId, name: folderName, parentId: null, createdAt: now, updatedAt: now }, ...result.folders], result.entries)
    return { ...result.report, format: result.format, folders: result.report.folders + 1, folderName }
  }

  createEntry(input: EntryInput): string {
    return this.requireSession().createEntry(input)
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = this.settings.update(patch)
    this.broadcast({ type: 'settings', settings: next })
    return next
  }
}
