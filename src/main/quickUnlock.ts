// Biometric quick unlock. After one successful master-password unlock, the vault's
// root key can be kept either in memory until PassVault quits ("session"), or
// encrypted by the OS keystore — Keychain, DPAPI or libsecret — on this device only
// ("device"). A biometric check gates its release. Both expire, after which the
// master password is required again. Nothing here is ever written to the vault file.

import { app, safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuickUnlockState } from '../shared/types'
import { wipe } from './vault/crypto'

const DAY = 24 * 60 * 60 * 1000

interface DeviceRecord {
  blob: string
  kdf: string
  createdAt: number
  expiresAt: number
}

export type Retrieval =
  | { ok: true; key: Uint8Array }
  | { ok: false; reason: 'missing' | 'expired' | 'changed' | 'unavailable' }

export class QuickUnlockStore {
  private readonly path: string
  private device: Record<string, DeviceRecord>
  private readonly session = new Map<string, { key: Uint8Array; kdf: string; expiresAt: number }>()

  constructor(directory = app.getPath('userData')) {
    this.path = join(directory, 'quick-unlock.json')
    this.device = this.load()
  }

  private load(): Record<string, DeviceRecord> {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, DeviceRecord>
      return typeof raw === 'object' && raw ? raw : {}
    } catch {
      return {}
    }
  }

  private async persist(): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true })
    const temp = `${this.path}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(this.device), { mode: 0o600 })
    await rename(temp, this.path)
  }

  async enroll(vaultId: string, rootKey: Uint8Array, kdf: string, mode: 'session' | 'device', days: number): Promise<QuickUnlockState> {
    await this.remove(vaultId)
    const expiresAt = Date.now() + days * DAY
    if (mode === 'session') {
      this.session.set(vaultId, { key: rootKey.slice(), kdf, expiresAt })
    } else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('The system keystore is not available.')
      const encoded = Buffer.from(rootKey).toString('base64')
      const blob = safeStorage.encryptString(encoded).toString('base64')
      this.device[vaultId] = { blob, kdf, createdAt: Date.now(), expiresAt }
      await this.persist()
    }
    return { enrolled: true, expiresAt, mode }
  }

  state(vaultId: string): QuickUnlockState {
    const now = Date.now()
    const session = this.session.get(vaultId)
    if (session && session.expiresAt > now) return { enrolled: true, expiresAt: session.expiresAt, mode: 'session' }
    const device = this.device[vaultId]
    if (device && device.expiresAt > now) return { enrolled: true, expiresAt: device.expiresAt, mode: 'device' }
    return { enrolled: false, expiresAt: null, mode: 'device' }
  }

  all(ids: string[]): Record<string, QuickUnlockState> {
    return Object.fromEntries(ids.map((id) => [id, this.state(id)]))
  }

  async retrieve(vaultId: string, kdf: string): Promise<Retrieval> {
    const now = Date.now()
    const session = this.session.get(vaultId)
    if (session) {
      if (session.expiresAt <= now) {
        await this.remove(vaultId)
        return { ok: false, reason: 'expired' }
      }
      if (session.kdf !== kdf) {
        await this.remove(vaultId)
        return { ok: false, reason: 'changed' }
      }
      return { ok: true, key: session.key.slice() }
    }
    const device = this.device[vaultId]
    if (!device) return { ok: false, reason: 'missing' }
    if (device.expiresAt <= now) {
      await this.remove(vaultId)
      return { ok: false, reason: 'expired' }
    }
    if (device.kdf !== kdf) {
      await this.remove(vaultId)
      return { ok: false, reason: 'changed' }
    }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, reason: 'unavailable' }
    try {
      const decoded = safeStorage.decryptString(Buffer.from(device.blob, 'base64'))
      const key = new Uint8Array(Buffer.from(decoded, 'base64'))
      if (key.length !== 32) throw new Error('bad key length')
      return { ok: true, key }
    } catch {
      await this.remove(vaultId)
      return { ok: false, reason: 'unavailable' }
    }
  }

  async remove(vaultId: string): Promise<void> {
    const session = this.session.get(vaultId)
    if (session) wipe(session.key)
    this.session.delete(vaultId)
    if (this.device[vaultId]) {
      delete this.device[vaultId]
      await this.persist()
    }
  }

  wipeSessionKeys(): void {
    for (const { key } of this.session.values()) wipe(key)
    this.session.clear()
  }
}
