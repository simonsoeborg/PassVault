/*
 * Browser-preview stand-in for the Electron bridge, used only by `npm run web:mock`.
 * Every value here is synthetic sample data — no real credentials, hosts or people.
 * This file never reaches a packaged build: main.tsx only imports it when
 * __PASSVAULT_MOCK__ is true, which electron-vite defines as false.
 */

import type { PassVaultApi } from '../../shared/api'
import { ENTRY_FIELDS } from '../../shared/types'
import type {
  AppEvent,
  AppState,
  CustomField,
  EntryDetail,
  EntryHealth,
  EntryInput,
  EntrySummary,
  EntryType,
  ErrorCode,
  FolderView,
  GeneratorOptions,
  Result,
  Settings,
  StoredEntry,
  StrengthEstimate,
  SyncStatus,
  VaultIndex,
  VaultInfo,
} from '../../shared/types'

type MockState = 'unlock' | 'welcome' | 'vault' | 'create' | 'empty'

const VAULT_ID = '8f3a21c9b74e4d1aa0c35f6e7b12d480'
const PATH = '/Users/simon/Library/Mobile Documents/com~apple~CloudDocs/Personal.pvault'
const DAY = 86_400_000

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(code: ErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const folders: FolderView[] = [
  { id: 'f-infra', name: 'Infrastructure', parentId: null, updatedAt: Date.now() - 9 * DAY },
  { id: 'f-prod', name: 'Production', parentId: 'f-infra', updatedAt: Date.now() - 4 * DAY },
  { id: 'f-staging', name: 'Staging', parentId: 'f-infra', updatedAt: Date.now() - 20 * DAY },
  { id: 'f-work', name: 'Work', parentId: null, updatedAt: Date.now() - 2 * DAY },
  { id: 'f-personal', name: 'Personal', parentId: null, updatedAt: Date.now() - 30 * DAY },
]

interface Seed {
  id: string
  type: EntryType
  title: string
  folderId: string | null
  fields: Record<string, string>
  tags?: string[]
  favorite?: boolean
  notes?: string
  custom?: CustomField[]
  days?: number
  health?: Partial<EntryHealth>
  trashed?: boolean
  history?: number
}

const seeds: Seed[] = [
  { id: 'e1', type: 'ssh', title: 'db-primary', folderId: 'f-prod', fields: { host: '10.0.4.12', port: '2222', username: 'deploy', auth: 'key', privateKey: 'sample-key', keyPassphrase: 'sample-pass', jumpHost: 'ops@bastion.example.net:22' }, tags: ['postgres'], favorite: true, days: 1, history: 3 },
  { id: 'e2', type: 'ssh', title: 'bastion', folderId: 'f-prod', fields: { host: 'bastion.example.net', username: 'ops', auth: 'key', privateKey: 'sample-key' }, favorite: true, days: 3 },
  { id: 'e3', type: 'ssh', title: 'k8s-control-1', folderId: 'f-prod', fields: { host: '10.0.8.3', username: 'core', auth: 'agent' }, days: 6 },
  { id: 'e4', type: 'ssh', title: 'build-runner', folderId: 'f-staging', fields: { host: 'runner.staging.example.net', port: '2200', username: 'ci', auth: 'password', password: 'sample-weak' }, days: 40, health: { weak: true } },
  { id: 'e5', type: 'ssh', title: 'nas', folderId: 'f-personal', fields: { host: '192.168.1.24', username: 'admin', auth: 'password', password: 'sample-pass' }, days: 120 },
  { id: 'e6', type: 'login', title: 'GitHub', folderId: 'f-work', fields: { username: 'simon', password: 'sample-pass', url: 'https://github.com', totp: 'otpauth://totp/GitHub:simon?secret=JBSWY3DPEHPK3PXP' }, favorite: true, days: 2 },
  { id: 'e7', type: 'login', title: 'AWS root account', folderId: 'f-prod', fields: { username: 'root@example.net', password: 'sample-pass', url: 'https://console.aws.amazon.com', totp: 'otpauth://totp/AWS:root?secret=JBSWY3DPEHPK3PXP' }, tags: ['break-glass'], days: 18 },
  { id: 'e8', type: 'login', title: 'Cloudflare', folderId: 'f-infra', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://dash.cloudflare.com' }, days: 25 },
  { id: 'e9', type: 'login', title: 'Hetzner Cloud', folderId: 'f-infra', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://console.hetzner.cloud' }, days: 60 },
  { id: 'e10', type: 'login', title: 'Grafana', folderId: 'f-prod', fields: { username: 'admin', password: 'sample-reused', url: 'https://grafana.example.net' }, days: 8, health: { reused: true } },
  { id: 'e11', type: 'login', title: 'Sentry', folderId: 'f-work', fields: { username: 'simon@example.net', password: 'sample-reused', url: 'https://sentry.io' }, days: 14, health: { reused: true } },
  { id: 'e12', type: 'login', title: 'Linear', folderId: 'f-work', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://linear.app' }, days: 5 },
  { id: 'e13', type: 'login', title: 'Figma', folderId: 'f-work', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://figma.com' }, days: 47 },
  { id: 'e14', type: 'login', title: 'Fastmail', folderId: 'f-personal', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://app.fastmail.com', totp: 'otpauth://totp/Fastmail?secret=JBSWY3DPEHPK3PXP' }, days: 400, health: { old: true } },
  { id: 'e15', type: 'login', title: 'Apple ID', folderId: 'f-personal', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://appleid.apple.com' }, days: 210 },
  { id: 'e16', type: 'login', title: 'Synology NAS', folderId: 'f-personal', fields: { username: 'simon', password: 'sample-pass', url: 'https://192.168.1.24:5001' }, days: 90 },
  { id: 'e17', type: 'apiKey', title: 'Stripe live key', folderId: 'f-prod', fields: { keyId: 'pk_live_51Sample', secret: 'sample-secret', environment: 'production', endpoint: 'https://api.stripe.com', expiresAt: new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10) }, tags: ['billing'], days: 11, health: { expiring: true } },
  { id: 'e18', type: 'apiKey', title: 'Stripe test key', folderId: 'f-staging', fields: { keyId: 'pk_test_51Sample', secret: 'sample-secret', environment: 'staging', endpoint: 'https://api.stripe.com' }, days: 11 },
  { id: 'e19', type: 'apiKey', title: 'npm publish token', folderId: 'f-work', fields: { keyId: 'npm_Sample', secret: 'sample-secret', environment: 'production', expiresAt: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10) }, days: 120, health: { expired: true } },
  { id: 'e20', type: 'apiKey', title: 'Docker Hub token', folderId: 'f-infra', fields: { keyId: 'dckr_pat_Sample', secret: 'sample-secret', environment: 'production' }, days: 33 },
  { id: 'e21', type: 'apiKey', title: 'Tailscale auth key', folderId: 'f-infra', fields: { keyId: 'tskey-auth-Sample', secret: 'sample-secret', environment: 'production', expiresAt: new Date(Date.now() + 55 * DAY).toISOString().slice(0, 10) }, days: 7 },
  { id: 'e22', type: 'note', title: 'AWS break-glass runbook', folderId: 'f-prod', fields: {}, notes: 'sample note body', tags: ['runbook'], days: 30 },
  { id: 'e23', type: 'note', title: 'GitHub recovery codes', folderId: 'f-work', fields: {}, notes: 'sample note body', days: 2 },
  { id: 'e24', type: 'note', title: 'Router setup', folderId: 'f-personal', fields: {}, notes: 'sample note body', days: 300 },
  { id: 'e25', type: 'card', title: 'Company Visa', folderId: 'f-work', fields: { cardholder: 'S. Søborg', number: '4242424242424242', expiry: '11/27', cvv: '123', pin: '0000' }, days: 65 },
  { id: 'e26', type: 'card', title: 'Personal Mastercard', folderId: 'f-personal', fields: { cardholder: 'S. Søborg', number: '5555555555554444', expiry: '02/26', cvv: '456' }, days: 140, health: { expiring: true } },
  { id: 'e27', type: 'identity', title: 'Passport', folderId: 'f-personal', fields: { fullName: 'Simon Søborg', email: 'simon@example.net', phone: '+45 00 00 00 00', address: 'Sample street 1\n2100 Copenhagen', birthDate: '1990-01-01', documentType: 'Passport', documentNumber: '000000000', issuer: 'Denmark', documentExpiry: new Date(Date.now() + 400 * DAY).toISOString().slice(0, 10) }, days: 500 },
  { id: 'e28', type: 'login', title: 'Vercel', folderId: 'f-work', fields: { username: 'simon@example.net', password: 'sample-pass', url: 'https://vercel.com' }, days: 21 },
  { id: 'e29', type: 'login', title: 'Nextcloud', folderId: 'f-personal', fields: { username: 'simon', password: 'sample-pass', url: 'https://cloud.example.net' }, days: 70 },
  { id: 'e30', type: 'ssh', title: 'mail relay', folderId: 'f-infra', fields: { host: 'mail.example.net', username: 'root', auth: 'key', privateKey: 'sample-key' }, days: 95 },
  { id: 'e31', type: 'login', title: 'Old staging admin', folderId: 'f-staging', fields: { username: 'admin', password: 'sample-pass' }, days: 220, trashed: true },
  { id: 'e32', type: 'apiKey', title: 'Retired Mapbox key', folderId: null, fields: { keyId: 'pk.sample', secret: 'sample-secret', environment: 'other' }, days: 320, trashed: true },
]

const WORDS = ['harbour', 'granite', 'lantern', 'willow', 'cobalt', 'marsh', 'thistle', 'quarry', 'amber', 'cedar', 'ripple', 'kestrel', 'saddle', 'mosaic', 'pewter', 'jetty']

function makeEntry(seed: Seed): StoredEntry {
  const updatedAt = Date.now() - (seed.days ?? 10) * DAY
  const history = Array.from({ length: seed.history ?? 0 }, (_, index) => ({
    title: seed.title,
    fields: { ...seed.fields },
    custom: [],
    notes: seed.notes ?? '',
    tags: seed.tags ?? [],
    updatedAt: updatedAt - (index + 1) * 12 * DAY,
  }))
  return {
    id: seed.id,
    type: seed.type,
    title: seed.title,
    folderId: seed.folderId,
    tags: seed.tags ?? [],
    favorite: seed.favorite ?? false,
    fields: { ...seed.fields },
    custom: seed.custom ?? [],
    notes: seed.notes ?? '',
    createdAt: updatedAt - 200 * DAY,
    updatedAt,
    trashedAt: seed.trashed ? updatedAt : null,
    history,
  }
}

export function createMockApi(mode: MockState): PassVaultApi {
  const active = mode === 'empty' ? [] : seeds
  if (mode === 'empty') folders.length = 0
  const entries = new Map(active.map((seed) => [seed.id, makeEntry(seed)]))
  const healthById = new Map(active.map((seed) => [seed.id, { weak: false, reused: false, old: false, expiring: false, expired: false, ...seed.health }]))
  const listeners = new Set<(event: AppEvent) => void>()
  let counter = 100

  const vault: VaultInfo = {
    path: PATH,
    fileName: 'Personal.pvault',
    name: 'Personal',
    vaultId: VAULT_ID,
    kdf: { algorithm: 'argon2id', memoryKiB: 131_072, iterations: 3, parallelism: 1 },
    cipher: 'xchacha20-poly1305',
    formatVersion: 1,
    lastSavedAt: Date.now() - 4 * 60_000,
    sizeBytes: 86_016,
  }

  let settings: Settings = {
    theme: 'system',
    autoLockMinutes: 5,
    lockOnSleep: true,
    lockOnMinimize: false,
    clipboardClearSeconds: 30,
    quickShortcut: 'CommandOrControl+Shift+Space',
    terminal: 'auto',
    sshAgentLifetimeMinutes: 60,
    hideFromScreenCapture: true,
    quickUnlockMode: 'device',
    quickUnlockDays: 7,
  }

  let locked = mode !== 'vault' && mode !== 'empty'
  let sync: SyncStatus = { state: 'saved', at: Date.now() - 4 * 60_000 }

  const emit = (event: AppEvent) => {
    for (const listener of listeners) listener(event)
  }
  const touch = () => {
    sync = { state: 'saved', at: Date.now() }
    emit({ type: 'index-changed' })
    emit({ type: 'sync', status: sync })
  }

  const subtitle = (entry: StoredEntry): string => {
    const f = entry.fields
    switch (entry.type) {
      case 'login':
        return [f.username, f.url?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).join(' · ')
      case 'ssh':
        return `${f.username ? `${f.username}@` : ''}${f.host ?? ''}${f.port && f.port !== '22' ? `:${f.port}` : ''}`
      case 'apiKey':
        return [f.environment, f.keyId].filter(Boolean).join(' · ')
      case 'note':
        return entry.tags.length ? entry.tags.join(' · ') : 'Sealed note'
      case 'card':
        return `${f.number?.startsWith('4') ? 'Visa' : 'Mastercard'} ···· ${(f.number ?? '').slice(-4)}`
      case 'identity':
        return [f.fullName, f.documentType].filter(Boolean).join(' · ')
    }
  }

  const summary = (entry: StoredEntry): EntrySummary => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    subtitle: subtitle(entry),
    folderId: entry.folderId,
    tags: entry.tags,
    favorite: entry.favorite,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    trashedAt: entry.trashedAt,
    hasTotp: Boolean(entry.type === 'login' && entry.fields.totp),
    health: healthById.get(entry.id) ?? { weak: false, reused: false, old: false, expiring: false, expired: false },
    searchText: [entry.title, subtitle(entry), ...entry.tags].join(' ').toLowerCase(),
  })

  const detail = (entry: StoredEntry): EntryDetail => {
    const { plain, secret } = ENTRY_FIELDS[entry.type]
    const fields: Record<string, string> = {}
    for (const key of plain) fields[key] = entry.fields[key] ?? ''
    const secrets: Record<string, boolean> = {}
    for (const key of secret) secrets[key] = Boolean(entry.fields[key])
    if (entry.type === 'note') secrets.body = Boolean(entry.notes)
    const number = (entry.fields.number ?? '').replace(/\D/g, '')
    return {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      folderId: entry.folderId,
      tags: entry.tags,
      favorite: entry.favorite,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      trashedAt: entry.trashedAt,
      fields,
      secrets,
      custom: entry.custom.map((field) => ({ id: field.id, label: field.label, secret: field.secret, present: Boolean(field.value), ...(field.secret ? {} : { value: field.value }) })),
      notes: entry.type === 'note' ? '' : entry.notes,
      history: entry.history
        .map((snap, index) => ({
          index,
          updatedAt: snap.updatedAt,
          title: snap.title,
          changed: ['password'],
          fields: Object.fromEntries(ENTRY_FIELDS[entry.type].plain.map((key) => [key, snap.fields[key] ?? ''])),
          secrets: Object.fromEntries(ENTRY_FIELDS[entry.type].secret.map((key) => [key, Boolean(snap.fields[key])])),
          notes: entry.type === 'note' ? '' : snap.notes,
          tags: snap.tags,
        }))
        .reverse(),
      health: healthById.get(entry.id) ?? { weak: false, reused: false, old: false, expiring: false, expired: false },
      hasTotp: Boolean(entry.type === 'login' && entry.fields.totp),
      strength: entry.type === 'login' || entry.type === 'ssh' ? (healthById.get(entry.id)?.weak ? 1 : 4) : null,
      ...(entry.type === 'card' ? { card: { brand: number.startsWith('4') ? 'Visa' : 'Mastercard', last4: number.slice(-4) } } : {}),
      ...(entry.type === 'ssh'
        ? {
            command: `ssh${entry.fields.port && entry.fields.port !== '22' ? ` -p ${entry.fields.port}` : ''}${entry.fields.jumpHost ? ` -J ${entry.fields.jumpHost}` : ''} ${entry.fields.username ? `${entry.fields.username}@` : ''}${entry.fields.host}`,
          }
        : {}),
    }
  }

  const index = (): VaultIndex => ({ folders: [...folders], entries: [...entries.values()].map(summary) })

  const state = (): AppState => ({
    platform: 'darwin',
    locked,
    vault: locked ? null : vault,
    recent: mode === 'welcome' || mode === 'create' ? [] : [{ path: PATH, name: 'Personal', vaultId: VAULT_ID, lastOpenedAt: Date.now() - 3600_000 }],
    settings,
    biometrics: { kind: 'touch-id', available: true, secureStorage: true },
    quickUnlock: mode === 'empty' ? {} : { [VAULT_ID]: { enrolled: true, expiresAt: Date.now() + 5 * DAY, mode: 'device' } },
    sync,
  })

  const unlock = async (password: string): Promise<Result<VaultInfo>> => {
    await wait(700)
    if (password === 'wrong') return fail('WRONG_PASSWORD', 'That password does not open this vault.')
    locked = false
    emit({ type: 'unlocked', vault })
    return ok(vault)
  }

  const copy = async (id: string, ref: string) => {
    const entry = entries.get(id)
    if (!entry) return fail<{ clearsAt: number | null }>('NOT_FOUND', 'That entry no longer exists.')
    const value = ref === 'body' ? entry.notes : (entry.fields[ref] ?? '')
    if (!value) return fail<{ clearsAt: number | null }>('INVALID', `${ref} is empty on this entry.`)
    const clearsAt = Date.now() + settings.clipboardClearSeconds * 1000
    emit({ type: 'clipboard', state: 'copied', label: ref === 'password' ? 'Password' : ref === 'totp' ? 'One-time code' : 'Value', clearsAt })
    setTimeout(() => emit({ type: 'clipboard', state: 'cleared' }), settings.clipboardClearSeconds * 1000)
    return ok({ clearsAt })
  }

  const put = (entry: StoredEntry) => {
    entries.set(entry.id, entry)
    touch()
  }

  return {
    getState: async () => state(),
    onEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    vault: {
      suggestLocations: async () => [
        { id: 'icloud', kind: 'icloud', label: 'iCloud Drive', path: '/Users/simon/Library/Mobile Documents/com~apple~CloudDocs' },
        { id: 'dropbox', kind: 'dropbox', label: 'Dropbox', path: '/Users/simon/Dropbox' },
        { id: 'sync', kind: 'syncthing', label: 'Syncthing', path: '/Users/simon/Sync' },
        { id: 'documents', kind: 'documents', label: 'Documents', path: '/Users/simon/Documents' },
      ],
      chooseNewPath: async ({ name }) => `/Users/simon/Documents/${name}.pvault`,
      chooseExisting: async () => PATH,
      inspect: async () => ok({ path: PATH, fileName: 'Personal.pvault', vaultId: VAULT_ID, kdf: vault.kdf, formatVersion: 1, sizeBytes: vault.sizeBytes, modifiedAt: Date.now() - 4 * 60_000 }),
      create: async ({ password }) => {
        await wait(900)
        if (password.length < 8) return fail('INVALID', 'Use a master password of at least 8 characters.')
        locked = false
        emit({ type: 'unlocked', vault })
        return ok(vault)
      },
      unlock: async ({ password }) => unlock(password),
      unlockWithBiometrics: async () => {
        await wait(900)
        locked = false
        emit({ type: 'unlocked', vault })
        return ok(vault)
      },
      lock: async () => {
        locked = true
        emit({ type: 'locked', reason: 'manual' })
      },
      index: async () => ok(index()),
      rename: async (name) => {
        vault.name = name
        touch()
        return ok(undefined as unknown as void)
      },
      changePassword: async ({ current }) => {
        await wait(900)
        return current === 'wrong' ? fail('WRONG_PASSWORD', 'The current master password is not right.') : ok(vault)
      },
      setKdf: async ({ preset }) => {
        await wait(900)
        vault.kdf = preset === 'strong' ? { algorithm: 'argon2id', memoryKiB: 524_288, iterations: 4, parallelism: 1 } : { algorithm: 'argon2id', memoryKiB: 131_072, iterations: 3, parallelism: 1 }
        return ok(vault)
      },
      forgetRecent: async () => undefined,
      showInFolder: async () => undefined,
      estimateStrength: async (password): Promise<StrengthEstimate> => {
        const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
        const bits = Math.round(password.length * (classes + 1) * 0.9)
        const score = (bits > 90 ? 4 : bits > 65 ? 3 : bits > 45 ? 2 : bits > 28 ? 1 : 0) as StrengthEstimate['score']
        return {
          score,
          guessesLog10: Math.round(bits * 0.301),
          warning: score <= 1 ? 'This is short enough to guess quickly.' : '',
          suggestions: score <= 2 ? ['Add another, less common word.'] : [],
          crackTime: score >= 4 ? 'centuries' : score === 3 ? '9 months' : score === 2 ? '3 hours' : 'instantly',
        }
      },
    },
    biometrics: {
      enroll: async (password) => {
        await wait(600)
        return password === 'wrong' ? fail('WRONG_PASSWORD', 'That master password is not right.') : ok({ enrolled: true, expiresAt: Date.now() + 7 * DAY, mode: settings.quickUnlockMode })
      },
      disenroll: async () => undefined,
    },
    folders: {
      create: async ({ name, parentId }) => {
        const id = `f-${++counter}`
        folders.push({ id, name, parentId, updatedAt: Date.now() })
        touch()
        return ok(id)
      },
      rename: async (id, name) => {
        const folder = folders.find((candidate) => candidate.id === id)
        if (folder) folder.name = name
        touch()
        return ok(undefined as unknown as void)
      },
      move: async () => ok(undefined as unknown as void),
      remove: async (id) => {
        const removed = folders.findIndex((folder) => folder.id === id)
        if (removed >= 0) folders.splice(removed, 1)
        touch()
        return ok(undefined as unknown as void)
      },
    },
    entries: {
      get: async (id) => {
        const entry = entries.get(id)
        return entry ? ok(detail(entry)) : fail('NOT_FOUND', 'That entry no longer exists.')
      },
      create: async (input: EntryInput) => {
        const id = `e-${++counter}`
        put({
          id,
          type: input.type,
          title: input.title || 'Untitled',
          folderId: input.folderId,
          tags: input.tags,
          favorite: false,
          fields: { ...input.fields },
          custom: input.custom.map((field, position) => ({ id: `c-${counter}-${position}`, label: field.label, value: field.value ?? '', secret: field.secret })),
          notes: input.notes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          trashedAt: null,
          history: [],
        })
        healthById.set(id, { weak: false, reused: false, old: false, expiring: false, expired: false })
        return ok(id)
      },
      update: async (id, input) => {
        const entry = entries.get(id)
        if (!entry) return fail('NOT_FOUND', 'That entry no longer exists.')
        put({
          ...entry,
          title: input.title || entry.title,
          folderId: input.folderId,
          tags: input.tags,
          fields: { ...entry.fields, ...input.fields },
          notes: entry.type === 'note' ? (input.fields.body ?? entry.notes) : input.notes,
          custom: input.custom.map((field, position) => ({ id: field.id ?? `c-${++counter}-${position}`, label: field.label, value: field.value ?? '', secret: field.secret })),
          updatedAt: Date.now(),
          history: [...entry.history, { title: entry.title, fields: entry.fields, custom: entry.custom, notes: entry.notes, tags: entry.tags, updatedAt: entry.updatedAt }],
        })
        emit({ type: 'entry-changed', id })
        return ok(undefined as unknown as void)
      },
      move: async (ids, folderId) => {
        for (const id of ids) {
          const entry = entries.get(id)
          if (entry) entries.set(id, { ...entry, folderId, updatedAt: Date.now() })
        }
        touch()
        return ok(undefined as unknown as void)
      },
      setFavorite: async (id, favorite) => {
        const entry = entries.get(id)
        if (entry) entries.set(id, { ...entry, favorite })
        touch()
        emit({ type: 'entry-changed', id })
        return ok(undefined as unknown as void)
      },
      trash: async (ids) => {
        for (const id of ids) {
          const entry = entries.get(id)
          if (entry) entries.set(id, { ...entry, trashedAt: Date.now() })
        }
        touch()
        return ok(undefined as unknown as void)
      },
      restore: async (ids) => {
        for (const id of ids) {
          const entry = entries.get(id)
          if (entry) entries.set(id, { ...entry, trashedAt: null })
        }
        touch()
        return ok(undefined as unknown as void)
      },
      purge: async (ids) => {
        for (const id of ids) entries.delete(id)
        touch()
        return ok(undefined as unknown as void)
      },
      reveal: async (id, ref) => {
        const entry = entries.get(id)
        if (!entry) return fail('NOT_FOUND', 'That entry no longer exists.')
        if (ref === 'body') return ok(entry.notes || 'Sample note body — synthetic preview data.')
        if (ref === 'privateKey') {
          return ok('-----BEGIN OPENSSH PRIVATE KEY-----\nc2FtcGxlLXByZXZpZXcta2V5LW5vdC1yZWFsLXNhbXBsZS1wcmV2aWV3LWtleQ==\nc2FtcGxlLXByZXZpZXcta2V5LW5vdC1yZWFsLXNhbXBsZS1wcmV2aWV3LWtleQ==\n-----END OPENSSH PRIVATE KEY-----')
        }
        const value = entry.fields[ref] ?? ''
        if (ref === 'password' || ref === 'secret') return ok(healthById.get(id)?.weak ? 'summer2024' : 'qF7-vtRm2-Wkx4-Ld9pN')
        if (ref === 'number') return ok(value)
        return ok(value || 'sample-value')
      },
      copy,
      totp: async (id) => {
        const entry = entries.get(id)
        if (!entry || !entry.fields.totp) return ok(null)
        const period = 30
        const counterValue = Math.floor(Date.now() / (period * 1000))
        const code = String((counterValue * 7919) % 1_000_000).padStart(6, '0')
        return ok({ code, period, expiresAt: (counterValue + 1) * period * 1000 })
      },
      restoreVersion: async (id) => {
        emit({ type: 'entry-changed', id })
        touch()
        return ok(undefined as unknown as void)
      },
    },
    generator: {
      generate: async (options: GeneratorOptions) => {
        if (options.mode === 'passphrase') {
          const words = Array.from({ length: options.words }, () => WORDS[Math.floor(Math.random() * WORDS.length)])
          if (options.capitalize) words.forEach((word, index) => (words[index] = word[0].toUpperCase() + word.slice(1)))
          if (options.includeNumber) words[Math.floor(Math.random() * words.length)] += Math.floor(Math.random() * 10)
          return { value: words.join(options.separator), entropyBits: Math.floor(options.words * 12.9) }
        }
        const alphabet = [
          options.upper ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : '',
          options.lower ? 'abcdefghijkmnpqrstuvwxyz' : '',
          options.digits ? '23456789' : '',
          options.symbols ? '!#$%&*+-.:;=?@^_~' : '',
        ].join('')
        const value = Array.from({ length: options.length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
        return { value, entropyBits: Math.floor(options.length * Math.log2(alphabet.length || 2)) }
      },
    },
    ssh: {
      connect: async () => {
        await wait(400)
        return ok({ copiedPassword: false, addedKey: true, terminal: 'Terminal' })
      },
      copyCommand: async (id) => copy(id, 'host'),
      addKey: async () => ok({ lifetimeMinutes: settings.sshAgentLifetimeMinutes }),
    },
    importer: {
      chooseFile: async (kind) => (kind === 'kdbx' ? '/Users/simon/Downloads/Passwords.kdb' : '/Users/simon/Downloads/keyfile.key'),
      kdbx: async ({ password, path }) => {
        await wait(1200)
        if (password === 'wrong') return fail('WRONG_PASSWORD', 'That password or key file does not open this KeePass database.')
        const format = path.toLowerCase().endsWith('.kdb') ? 'kdb' : 'kdbx'
        return ok({
          format,
          folders: 7,
          entries: 214,
          ssh: 31,
          totp: format === 'kdb' ? 0 : 12,
          skipped: 3,
          attachmentsSkipped: format === 'kdb' ? 2 : 0,
          folderName: 'KeePass · Passwords',
        })
      },
    },
    settings: {
      update: async (patch) => {
        settings = { ...settings, ...patch }
        emit({ type: 'settings', settings })
        return settings
      },
    },
    window: {
      openExternal: async () => undefined,
      hideQuick: async () => undefined,
      showMain: async () => undefined,
    },
  }
}
