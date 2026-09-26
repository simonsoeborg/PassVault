// An unlocked vault. Owns the decrypted data and the keys, saves every change
// atomically, and watches the file so edits synced in from other devices are
// merged instead of overwritten.

import { watch, type FSWatcher } from 'node:fs'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  ENTRY_TYPES,
  type EntryDetail,
  type EntryInput,
  type ErrorCode,
  type FieldRef,
  type KdfPreset,
  type StoredEntry,
  type StoredFolder,
  type SyncStatus,
  type VaultData,
  type VaultIndex,
  type VaultInfo,
} from '../../shared/types'
import { buildSsh } from '../ssh/command'
import { estimateStrength } from '../strength'
import {
  KDF_PRESETS,
  SALT_LEN,
  constantTimeEqual,
  deriveRootKey,
  deriveSubKeys,
  randomBytes,
  sha256Hex,
  wipe,
  wipeSubKeys,
  type KdfParams,
  type SubKeys,
} from './crypto'
import { FORMAT_VERSION, VaultFormatError, kdfFingerprint, openVault, parseHeader, sealVault, vaultIdHex } from './format'
import { baseHashes, entryHash, mergeVaults, type MergeResult } from './merge'
import { HEALTHY, applyInput, computeHealth, newId, primaryPassword, readField, sshCommandParts, toDetail, toSummary } from './model'

export class SessionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SessionError'
  }
}

export interface SessionListener {
  indexChanged(): void
  entryChanged(id: string): void
  sync(status: SyncStatus): void
  /** The file on disk now needs a different key (master password changed elsewhere). */
  keyChanged(): void
}

interface SessionOptions {
  listener: SessionListener
  recoveryDir: string
}

const SAVE_DELAY_MS = 350
const POLL_MS = 4_000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${Buffer.from(randomBytes(4)).toString('hex')}.tmp`)
  const handle = await open(temp, 'w', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temp, path)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Sync clients and virus scanners briefly lock files on Windows.
      if (attempt < 5 && (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')) {
        await delay(100 * 2 ** attempt)
        continue
      }
      await unlink(temp).catch(() => undefined)
      throw error
    }
  }
}

async function readVaultFile(path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SessionError('NOT_FOUND', 'The vault file is missing. It may have been moved, renamed, or not synced to this device yet.')
    }
    throw new SessionError('IO', 'The vault file could not be read.')
  }
}

/** Order-insensitive identity of a vault, so two devices never ping-pong identical content. */
function vaultFingerprint(data: VaultData): string {
  const entries = [...data.entries].sort((a, b) => a.id.localeCompare(b.id)).map((e) => `${entryHash(e)}|${JSON.stringify(e.history)}`)
  const folders = [...data.folders].sort((a, b) => a.id.localeCompare(b.id)).map((f) => JSON.stringify(f))
  const stones = [...data.tombstones].sort((a, b) => a.id.localeCompare(b.id)).map((t) => `${t.id}:${t.deletedAt}`)
  return JSON.stringify([data.name, data.nameUpdatedAt, entries, folders, stones])
}

function describeMerge(result: MergeResult): string {
  const parts: string[] = []
  if (result.added) parts.push(`${result.added} added`)
  if (result.updated) parts.push(`${result.updated} updated`)
  if (result.removed) parts.push(`${result.removed} removed`)
  if (result.conflicts) parts.push(`${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'} kept in history`)
  return parts.length ? `Merged from another device: ${parts.join(', ')}` : 'Merged from another device'
}

export class VaultSession {
  private keys: SubKeys
  private base: Map<string, string>
  private dirty = false
  private closed = false
  private saveTimer: NodeJS.Timeout | null = null
  private checkTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private watcher: FSWatcher | null = null
  private queue: Promise<void> = Promise.resolve()
  private lastStat: { size: number; mtimeMs: number } | null = null
  private lastSavedAt: number | null = null
  private sizeBytes = 0
  private diskDigest = ''
  private readonly strength = new Map<string, number>()

  private constructor(
    readonly path: string,
    private vaultIdBytes: Uint8Array,
    private kdf: KdfParams,
    private rootKey: Uint8Array,
    private data: VaultData,
    private readonly options: SessionOptions,
  ) {
    this.keys = deriveSubKeys(rootKey)
    this.base = baseHashes(data)
  }

  // ---------------------------------------------------------------- lifecycle

  static async create(input: { path: string; name: string; password: string; preset: KdfPreset } & SessionOptions): Promise<VaultSession> {
    const exists = await stat(input.path).then(
      () => true,
      () => false,
    )
    if (exists) throw new SessionError('INVALID', 'A file already exists at that location. Choose another name.')
    const kdf: KdfParams = { ...KDF_PRESETS[input.preset], salt: randomBytes(SALT_LEN) }
    const rootKey = await deriveRootKey(input.password, kdf)
    const now = Date.now()
    const data: VaultData = {
      schema: 1,
      name: input.name.trim().slice(0, 200) || 'Vault',
      nameUpdatedAt: now,
      createdAt: now,
      folders: [],
      entries: [],
      tombstones: [],
    }
    const session = new VaultSession(input.path, randomBytes(16), kdf, rootKey, data, input)
    await mkdir(dirname(input.path), { recursive: true })
    session.dirty = true
    await session.flush()
    session.startWatching()
    return session
  }

  static async open(input: { path: string; password: string } & SessionOptions): Promise<VaultSession> {
    const bytes = await readVaultFile(input.path)
    const header = parseHeader(bytes)
    const rootKey = await deriveRootKey(input.password, header.kdf)
    return VaultSession.fromBytes(input.path, bytes, rootKey, input)
  }

  static async openWithKey(input: { path: string; rootKey: Uint8Array } & SessionOptions): Promise<VaultSession> {
    const bytes = await readVaultFile(input.path)
    return VaultSession.fromBytes(input.path, bytes, input.rootKey, input)
  }

  /** Reads just the plaintext header: enough to show which vault a file is, and to check a cached key. */
  static async inspect(path: string) {
    const bytes = await readVaultFile(path)
    const header = parseHeader(bytes)
    const info = await stat(path)
    return { header, sizeBytes: bytes.length, modifiedAt: info.mtimeMs }
  }

  private static async fromBytes(path: string, bytes: Uint8Array, rootKey: Uint8Array, options: SessionOptions): Promise<VaultSession> {
    try {
      const { header, data } = openVault(bytes, rootKey)
      const info = await stat(path)
      const session = new VaultSession(path, header.vaultId, header.kdf, rootKey, data, options)
      session.diskDigest = sha256Hex(bytes)
      session.sizeBytes = bytes.length
      session.lastStat = { size: info.size, mtimeMs: info.mtimeMs }
      session.lastSavedAt = info.mtimeMs
      session.startWatching()
      return session
    } catch (error) {
      wipe(rootKey)
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    try {
      await this.flush()
    } catch {
      await this.writeRecoveryCopy()
    }
    this.closed = true
    if (this.saveTimer) clearTimeout(this.saveTimer)
    if (this.checkTimer) clearTimeout(this.checkTimer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.watcher?.close()
    wipe(this.rootKey)
    wipeSubKeys(this.keys)
    this.strength.clear()
    this.data = { ...this.data, entries: [], folders: [], tombstones: [] }
  }

  /** When the file cannot be written, the encrypted vault is kept next to the app's settings instead. */
  private async writeRecoveryCopy(): Promise<void> {
    try {
      const bytes = sealVault({ data: this.data, vaultId: this.vaultIdBytes, kdf: this.kdf, keys: this.keys })
      await mkdir(this.options.recoveryDir, { recursive: true })
      await writeFile(join(this.options.recoveryDir, `${vaultIdHex(this.vaultIdBytes)}-${Date.now()}.pvault`), bytes, { mode: 0o600 })
    } catch {
      // Nothing more can be done without a writable disk.
    }
  }

  // ---------------------------------------------------------------- identity

  get vaultId(): string {
    return vaultIdHex(this.vaultIdBytes)
  }

  get kdfFingerprint(): string {
    return kdfFingerprint(this.kdf)
  }

  get info(): VaultInfo {
    return {
      path: this.path,
      fileName: basename(this.path),
      name: this.data.name,
      vaultId: this.vaultId,
      kdf: { algorithm: 'argon2id', memoryKiB: this.kdf.memoryKiB, iterations: this.kdf.iterations, parallelism: this.kdf.parallelism },
      cipher: 'xchacha20-poly1305',
      formatVersion: FORMAT_VERSION,
      lastSavedAt: this.lastSavedAt,
      sizeBytes: this.sizeBytes,
    }
  }

  rootKeyCopy(): Uint8Array {
    return this.rootKey.slice()
  }

  async verifyPassword(password: string): Promise<boolean> {
    const candidate = await deriveRootKey(password, this.kdf)
    try {
      return constantTimeEqual(candidate, this.rootKey)
    } finally {
      wipe(candidate)
    }
  }

  // ---------------------------------------------------------------- reads

  private scoreOf(password: string): number {
    let score = this.strength.get(password)
    if (score === undefined) {
      score = estimateStrength(password).score
      this.strength.set(password, score)
    }
    return score
  }

  private health() {
    const strength = new Map<string, number>()
    for (const entry of this.data.entries) {
      const password = primaryPassword(entry)
      if (password) strength.set(entry.id, this.scoreOf(password))
    }
    return computeHealth(this.data, { strength })
  }

  index(): VaultIndex {
    const health = this.health()
    return {
      folders: this.data.folders
        .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, updatedAt: f.updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      entries: this.data.entries.map((entry) => toSummary(entry, health.get(entry.id) ?? HEALTHY)),
    }
  }

  private find(id: string): StoredEntry {
    const entry = this.data.entries.find((e) => e.id === id)
    if (!entry) throw new SessionError('NOT_FOUND', 'That entry no longer exists. It may have been deleted on another device.')
    return entry
  }

  entry(id: string): StoredEntry {
    return this.find(id)
  }

  detail(id: string): EntryDetail {
    const entry = this.find(id)
    const password = primaryPassword(entry)
    const command = entry.type === 'ssh' ? buildSsh(sshCommandParts(entry)) : null
    return toDetail(
      entry,
      this.health().get(id) ?? HEALTHY,
      password ? this.scoreOf(password) : null,
      command?.ok ? command.display : undefined,
    )
  }

  readField(id: string, ref: FieldRef): string {
    const value = readField(this.find(id), ref)
    if (value === null) throw new SessionError('INVALID', 'That field does not exist on this entry.')
    return value
  }

  // ---------------------------------------------------------------- mutations

  private touch(entryId?: string): void {
    this.dirty = true
    this.options.listener.indexChanged()
    if (entryId) this.options.listener.entryChanged(entryId)
    this.scheduleSave()
  }

  private assertFolder(folderId: string | null): void {
    if (folderId !== null && !this.data.folders.some((f) => f.id === folderId)) {
      throw new SessionError('NOT_FOUND', 'That folder no longer exists.')
    }
  }

  createEntry(input: EntryInput): string {
    if (!ENTRY_TYPES.includes(input.type)) throw new SessionError('INVALID', 'Unknown entry type.')
    this.assertFolder(input.folderId)
    const entry = applyInput(null, input)
    this.data.entries.push(entry)
    this.touch(entry.id)
    return entry.id
  }

  updateEntry(id: string, input: EntryInput): void {
    const existing = this.find(id)
    this.assertFolder(input.folderId)
    const next = applyInput(existing, { ...input, type: existing.type })
    if (next === existing) return
    this.data.entries[this.data.entries.indexOf(existing)] = next
    this.touch(id)
  }

  moveEntries(ids: string[], folderId: string | null): void {
    this.assertFolder(folderId)
    const now = Date.now()
    for (const id of ids) {
      const entry = this.find(id)
      if (entry.folderId === folderId) continue
      entry.folderId = folderId
      entry.updatedAt = now
    }
    this.touch()
  }

  setFavorite(id: string, favorite: boolean): void {
    const entry = this.find(id)
    if (entry.favorite === favorite) return
    entry.favorite = favorite
    entry.updatedAt = Date.now()
    this.touch(id)
  }

  trash(ids: string[]): void {
    const now = Date.now()
    for (const id of ids) {
      const entry = this.find(id)
      entry.trashedAt = now
      entry.updatedAt = now
    }
    this.touch()
  }

  restore(ids: string[]): void {
    const now = Date.now()
    for (const id of ids) {
      const entry = this.find(id)
      entry.trashedAt = null
      entry.updatedAt = now
      if (entry.folderId && !this.data.folders.some((f) => f.id === entry.folderId)) entry.folderId = null
    }
    this.touch()
  }

  purge(ids: string[]): void {
    const now = Date.now()
    const remove = new Set(ids)
    this.data.entries = this.data.entries.filter((e) => !remove.has(e.id))
    for (const id of remove) this.data.tombstones.push({ id, kind: 'entry', deletedAt: now })
    this.touch()
  }

  restoreVersion(id: string, index: number): void {
    const entry = this.find(id)
    const snap = entry.history[index]
    if (!snap) throw new SessionError('NOT_FOUND', 'That version is no longer in the history.')
    const fields = entry.type === 'note' ? { ...snap.fields, body: snap.notes } : { ...snap.fields }
    this.updateEntry(id, {
      type: entry.type,
      title: snap.title,
      folderId: entry.folderId,
      tags: snap.tags,
      favorite: entry.favorite,
      fields,
      custom: snap.custom.map((c) => ({ id: c.id, label: c.label, secret: c.secret, value: c.value })),
      notes: snap.notes,
    })
  }

  createFolder(name: string, parentId: string | null): string {
    this.assertFolder(parentId)
    const now = Date.now()
    const folder: StoredFolder = { id: newId(), name: name.trim().slice(0, 200) || 'New folder', parentId, createdAt: now, updatedAt: now }
    this.data.folders.push(folder)
    this.touch()
    return folder.id
  }

  renameFolder(id: string, name: string): void {
    const folder = this.data.folders.find((f) => f.id === id)
    if (!folder) throw new SessionError('NOT_FOUND', 'That folder no longer exists.')
    folder.name = name.trim().slice(0, 200) || folder.name
    folder.updatedAt = Date.now()
    this.touch()
  }

  private descendants(id: string): Set<string> {
    const out = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const folder of this.data.folders) {
        if (folder.parentId && out.has(folder.parentId) && !out.has(folder.id)) {
          out.add(folder.id)
          grew = true
        }
      }
    }
    return out
  }

  moveFolder(id: string, parentId: string | null): void {
    const folder = this.data.folders.find((f) => f.id === id)
    if (!folder) throw new SessionError('NOT_FOUND', 'That folder no longer exists.')
    this.assertFolder(parentId)
    if (parentId && this.descendants(id).has(parentId)) throw new SessionError('INVALID', 'A folder cannot move inside itself.')
    folder.parentId = parentId
    folder.updatedAt = Date.now()
    this.touch()
  }

  /** Removes a folder and its subfolders. Their entries go to the trash rather than disappearing. */
  removeFolder(id: string): void {
    const doomed = this.descendants(id)
    const now = Date.now()
    for (const entry of this.data.entries) {
      if (entry.folderId && doomed.has(entry.folderId)) {
        entry.folderId = null
        entry.trashedAt = entry.trashedAt ?? now
        entry.updatedAt = now
      }
    }
    this.data.folders = this.data.folders.filter((f) => !doomed.has(f.id))
    for (const folderId of doomed) this.data.tombstones.push({ id: folderId, kind: 'folder', deletedAt: now })
    this.touch()
  }

  rename(name: string): void {
    const trimmed = name.trim().slice(0, 200)
    if (!trimmed || trimmed === this.data.name) return
    this.data.name = trimmed
    this.data.nameUpdatedAt = Date.now()
    this.touch()
  }

  addImported(folders: StoredFolder[], entries: StoredEntry[]): void {
    this.data.folders.push(...folders)
    this.data.entries.push(...entries)
    this.touch()
  }

  // ---------------------------------------------------------------- keys

  async changeKey(current: string, next: string, preset?: KdfPreset): Promise<void> {
    if (!(await this.verifyPassword(current))) throw new SessionError('WRONG_PASSWORD', 'The current master password is not right.')
    await this.enqueue(async () => {
      await this.absorbDiskChanges(true)
      const params = preset ? KDF_PRESETS[preset] : { memoryKiB: this.kdf.memoryKiB, iterations: this.kdf.iterations, parallelism: this.kdf.parallelism }
      const kdf: KdfParams = { ...params, salt: randomBytes(SALT_LEN) }
      const rootKey = await deriveRootKey(next, kdf)
      const keys = deriveSubKeys(rootKey)
      const bytes = sealVault({ data: this.data, vaultId: this.vaultIdBytes, kdf, keys })
      try {
        await atomicWrite(this.path, bytes)
      } catch (error) {
        wipe(rootKey)
        wipeSubKeys(keys)
        throw error
      }
      wipe(this.rootKey)
      wipeSubKeys(this.keys)
      this.rootKey = rootKey
      this.keys = keys
      this.kdf = kdf
      await this.recordWrite(bytes, baseHashes(this.data))
    })
  }

  // ---------------------------------------------------------------- persistence

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flush().catch(() => undefined)
    }, SAVE_DELAY_MS)
  }

  flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    return this.enqueue(async () => {
      if (!this.dirty || this.closed) return
      this.options.listener.sync({ state: 'saving', at: Date.now() })
      try {
        await this.absorbDiskChanges(true)
        const bytes = sealVault({ data: this.data, vaultId: this.vaultIdBytes, kdf: this.kdf, keys: this.keys })
        const base = baseHashes(this.data)
        this.dirty = false
        try {
          await atomicWrite(this.path, bytes)
        } catch (error) {
          this.dirty = true
          throw error
        }
        await this.recordWrite(bytes, base)
      } catch (error) {
        const detail =
          error instanceof SessionError || error instanceof VaultFormatError ? error.message : 'The vault could not be saved. Check that the folder is writable.'
        this.options.listener.sync({ state: 'error', at: Date.now(), detail })
        throw error
      }
    })
  }

  private async recordWrite(bytes: Uint8Array, base: Map<string, string>): Promise<void> {
    this.diskDigest = sha256Hex(bytes)
    this.base = base
    this.sizeBytes = bytes.length
    this.lastSavedAt = Date.now()
    const info = await stat(this.path)
    this.lastStat = { size: info.size, mtimeMs: info.mtimeMs }
    this.options.listener.sync({ state: 'saved', at: this.lastSavedAt })
  }

  private startWatching(): void {
    try {
      this.watcher = watch(dirname(this.path), { persistent: false }, (_event, filename) => {
        if (filename && filename.toString() !== basename(this.path)) return
        this.scheduleCheck()
      })
      this.watcher.on('error', () => {
        this.watcher?.close()
        this.watcher = null
      })
    } catch {
      // Some network and cloud folders cannot be watched; polling covers them.
    }
    this.pollTimer = setInterval(() => this.scheduleCheck(), POLL_MS)
  }

  private scheduleCheck(): void {
    if (this.checkTimer || this.closed) return
    this.checkTimer = setTimeout(() => {
      this.checkTimer = null
      this.enqueue(() => this.absorbDiskChanges(false)).catch(() => undefined)
    }, 250)
  }

  /**
   * Merges the file on disk into memory when another device changed it. Runs before
   * every save, so a save never overwrites edits that arrived through sync.
   */
  private async absorbDiskChanges(beforeSave: boolean): Promise<void> {
    if (this.closed) return
    let info
    try {
      info = await stat(this.path)
    } catch {
      if (beforeSave) return // the file was moved or deleted: writing recreates it
      this.options.listener.sync({ state: 'error', at: Date.now(), detail: 'The vault file is missing from its folder. Changes will recreate it on the next save.' })
      return
    }
    if (this.lastStat && info.size === this.lastStat.size && info.mtimeMs === this.lastStat.mtimeMs) return

    const bytes = new Uint8Array(await readFile(this.path))
    this.lastStat = { size: info.size, mtimeMs: info.mtimeMs }
    const digest = sha256Hex(bytes)
    if (digest === this.diskDigest) return

    let header
    try {
      header = parseHeader(bytes)
    } catch {
      // Often a sync client mid-download. Don't overwrite it; try again shortly.
      this.lastStat = null
      throw new SessionError('CORRUPT', 'The synced vault file is incomplete or damaged. PassVault will retry.')
    }
    if (kdfFingerprint(header.kdf) !== kdfFingerprint(this.kdf)) {
      this.options.listener.keyChanged()
      throw new SessionError('LOCKED', 'The master password was changed on another device.')
    }

    let remote
    try {
      remote = openVault(bytes, this.rootKey)
    } catch (error) {
      if (error instanceof VaultFormatError && error.code === 'WRONG_PASSWORD') {
        this.options.listener.keyChanged()
        throw new SessionError('LOCKED', 'The master password was changed on another device.')
      }
      this.lastStat = null
      throw error
    }

    const result = mergeVaults(this.data, remote.data, this.base)
    this.data = result.data
    this.base = baseHashes(remote.data)
    this.diskDigest = digest
    this.sizeBytes = bytes.length
    if (vaultFingerprint(result.data) !== vaultFingerprint(remote.data)) {
      this.dirty = true
      if (!beforeSave) this.scheduleSave()
    }
    if (result.added || result.updated || result.removed || result.conflicts) {
      this.options.listener.indexChanged()
      this.options.listener.sync({ state: 'merged', at: Date.now(), detail: describeMerge(result), conflicts: result.conflicts })
    }
  }
}
