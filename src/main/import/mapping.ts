// Field-mapping rules shared by every import format. Each reader converts its own
// entries into RawEntry, so SSH detection, the three TOTP conventions and key
// attachments behave identically whether the source was .kdbx or .kdb.

import type { CustomField, EntryType } from '../../shared/types'
import { parseTotp } from '../totp'

export interface RawField {
  label: string
  value: string
  secret: boolean
}

export interface RawFile {
  name: string
  bytes: Uint8Array
}

/** A source entry, stripped of everything format-specific. */
export interface RawEntry {
  title: string
  username: string
  password: string
  url: string
  notes: string
  tags: string[]
  /** Every field that is not one of the five standard ones. */
  extra: RawField[]
  files: RawFile[]
}

export interface MappedEntry {
  type: EntryType
  title: string
  fields: Record<string, string>
  custom: CustomField[]
  notes: string
  tags: string[]
  hasTotp: boolean
  /** Attachments that were not private keys: this vault stores text, not files. */
  droppedFiles: number
}

export const clip = (value: string, max = 200_000): string => value.slice(0, max)

const MAX_KEY_BYTES = 64_000

function valid(uri: string): boolean {
  try {
    parseTotp(uri)
    return true
  } catch {
    return false
  }
}

/** KeePassXC's `otp`, KeePass 2.47's `TimeOtp-*`, and the legacy `TOTP Seed` plugin. */
function totpFrom(extra: Map<string, RawField>): { uri: string; consumed: string[] } | null {
  const at = (label: string) => extra.get(label)?.value ?? ''

  const otp = at('otp')
  if (otp && valid(otp)) return { uri: otp, consumed: ['otp'] }

  const base32 = at('TimeOtp-Secret-Base32').replace(/\s/g, '')
  if (base32) {
    const algorithm = { 'HMAC-SHA-256': 'SHA256', 'HMAC-SHA-512': 'SHA512' }[at('TimeOtp-Algorithm')] ?? 'SHA1'
    const period = at('TimeOtp-Period') || '30'
    const digits = at('TimeOtp-Length') || '6'
    const uri = `otpauth://totp/Imported?secret=${encodeURIComponent(base32)}&period=${encodeURIComponent(period)}&digits=${encodeURIComponent(digits)}&algorithm=${algorithm}`
    if (valid(uri)) return { uri, consumed: ['TimeOtp-Secret-Base32', 'TimeOtp-Algorithm', 'TimeOtp-Period', 'TimeOtp-Length'] }
  }

  const seed = at('TOTP Seed').replace(/\s/g, '')
  if (seed) {
    const [period = '30', digits = '6'] = at('TOTP Settings').split(';')
    if (digits === 'S') return null // Steam Guard uses a different alphabet; kept as a secret field
    const uri = `otpauth://totp/Imported?secret=${encodeURIComponent(seed)}&period=${encodeURIComponent(period || '30')}&digits=${encodeURIComponent(digits || '6')}`
    if (valid(uri)) return { uri, consumed: ['TOTP Seed', 'TOTP Settings'] }
  }
  return null
}

export function sshUrl(url: string): { host: string; port: string; username: string } | null {
  if (!/^ssh:\/\//i.test(url)) return null
  try {
    const parsed = new URL(url)
    const port = parsed.port && parsed.port !== '22' ? parsed.port : ''
    return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port, username: decodeURIComponent(parsed.username) }
  } catch {
    return null
  }
}

function keyFiles(files: RawFile[]): { privateKey: string | null; ppk: CustomField[]; dropped: number } {
  let privateKey: string | null = null
  const ppk: CustomField[] = []
  let dropped = 0
  for (const file of files) {
    const looksLikeKey = /\.(key|pem|ppk)$|^id_/i.test(file.name)
    if (!looksLikeKey || file.bytes.length > MAX_KEY_BYTES) {
      dropped++
      continue
    }
    const content = new TextDecoder().decode(file.bytes)
    if (/\.ppk$/i.test(file.name) || content.startsWith('PuTTY-User-Key-File')) {
      // PuTTY keys are kept sealed rather than converted: the agent loads OpenSSH and PEM.
      ppk.push({ id: '', label: file.name, value: content, secret: true })
    } else if (!privateKey && content.includes('-----BEGIN') && content.includes('PRIVATE KEY')) {
      privateKey = content
    } else {
      dropped++
    }
  }
  return { privateKey, ppk, dropped }
}

export function mapEntry(raw: RawEntry, newId: () => string): MappedEntry {
  const extra = new Map(raw.extra.map((field) => [field.label, field]))
  const totp = totpFrom(extra)
  const ssh = sshUrl(raw.url)
  const { privateKey, ppk, dropped } = keyFiles(raw.files)
  const type: EntryType = ssh || privateKey ? 'ssh' : 'login'

  const consumed = new Set(totp?.consumed ?? [])
  const custom: CustomField[] = []
  for (const field of raw.extra) {
    if (consumed.has(field.label)) continue
    custom.push({ id: newId(), label: clip(field.label, 200), value: clip(field.value), secret: field.secret })
  }
  for (const field of ppk) custom.push({ ...field, id: newId() })

  const fields: Record<string, string> = {}
  const set = (key: string, value: string) => {
    if (value) fields[key] = clip(value)
  }
  if (type === 'ssh') {
    set('host', ssh?.host ?? '')
    set('port', ssh?.port ?? '')
    set('username', ssh?.username || raw.username)
    if (privateKey) {
      set('privateKey', privateKey)
      set('keyPassphrase', raw.password)
      set('auth', 'key')
    } else {
      set('password', raw.password)
      set('auth', 'password')
    }
  } else {
    set('username', raw.username)
    set('password', raw.password)
    set('url', raw.url)
    set('totp', totp?.uri ?? '')
  }
  // An SSH entry has no TOTP field of its own, so keep the code as a sealed field.
  if (type === 'ssh' && totp) custom.push({ id: newId(), label: 'One-time code', value: totp.uri, secret: true })

  return {
    type,
    title: clip(raw.title, 1000) || ssh?.host || raw.username || 'Untitled',
    fields,
    custom: custom.slice(0, 200),
    notes: clip(raw.notes),
    tags: raw.tags.map((tag) => clip(tag, 80)).slice(0, 100),
    hasTotp: Boolean(totp),
    droppedFiles: dropped,
  }
}

/** True when an entry carries nothing worth storing. */
export function isEmptyEntry(mapped: MappedEntry): boolean {
  return !Object.keys(mapped.fields).length && !mapped.notes && !mapped.custom.length && mapped.title === 'Untitled'
}

// --------------------------------------------------------------------------
// The call shape every reader shares
// --------------------------------------------------------------------------

export interface ImportOptions {
  file: Uint8Array
  password: string
  keyFile?: Uint8Array
  rootFolderId: string
  now: number
  newId: () => string
}

export interface ImportResult {
  folders: import('../../shared/types').StoredFolder[]
  entries: import('../../shared/types').StoredEntry[]
  report: Omit<import('../../shared/types').ImportReport, 'folderName' | 'format'>
}
