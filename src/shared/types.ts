// Types shared by the main process, the preload bridge and the renderer.
// Nothing in here may import Node or Electron modules.

export type EntryType = 'login' | 'ssh' | 'apiKey' | 'note' | 'card' | 'identity'

export const ENTRY_TYPES: readonly EntryType[] = ['login', 'ssh', 'apiKey', 'note', 'card', 'identity']

/** Field keys per entry type. Secret fields never reach the renderer unless explicitly revealed. */
export const ENTRY_FIELDS: Record<EntryType, { plain: readonly string[]; secret: readonly string[] }> = {
  login: { plain: ['username', 'url'], secret: ['password', 'totp'] },
  ssh: { plain: ['host', 'port', 'username', 'auth', 'jumpHost'], secret: ['privateKey', 'keyPassphrase', 'password'] },
  apiKey: { plain: ['keyId', 'environment', 'endpoint', 'expiresAt'], secret: ['secret'] },
  note: { plain: [], secret: ['body'] },
  card: { plain: ['cardholder', 'expiry'], secret: ['number', 'cvv', 'pin'] },
  identity: {
    plain: ['fullName', 'email', 'phone', 'address', 'birthDate', 'documentType', 'issuer', 'documentExpiry'],
    secret: ['documentNumber'],
  },
}

export function isSecretField(type: EntryType, key: string): boolean {
  return ENTRY_FIELDS[type].secret.includes(key)
}

export type SshAuth = 'key' | 'password' | 'agent'
export type ApiEnvironment = 'production' | 'staging' | 'development' | 'other'

export interface CustomField {
  id: string
  label: string
  value: string
  secret: boolean
}

/** A field reference: a built-in key such as "password", "notes", or "custom:<id>". */
export type FieldRef = string

// ---------------------------------------------------------------------------
// Persisted vault data (lives only inside the encrypted file and main memory)
// ---------------------------------------------------------------------------

export interface EntrySnapshot {
  title: string
  fields: Record<string, string>
  custom: CustomField[]
  notes: string
  tags: string[]
  updatedAt: number
}

export interface StoredEntry {
  id: string
  type: EntryType
  title: string
  folderId: string | null
  tags: string[]
  favorite: boolean
  fields: Record<string, string>
  custom: CustomField[]
  notes: string
  createdAt: number
  updatedAt: number
  trashedAt: number | null
  history: EntrySnapshot[]
}

export interface StoredFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export interface Tombstone {
  id: string
  kind: 'entry' | 'folder'
  deletedAt: number
}

export interface VaultData {
  schema: 1
  name: string
  nameUpdatedAt: number
  createdAt: number
  folders: StoredFolder[]
  entries: StoredEntry[]
  tombstones: Tombstone[]
}

// ---------------------------------------------------------------------------
// Renderer-facing views (no secret values)
// ---------------------------------------------------------------------------

export interface EntryHealth {
  weak: boolean
  reused: boolean
  old: boolean
  expiring: boolean
  expired: boolean
}

export interface EntrySummary {
  id: string
  type: EntryType
  title: string
  subtitle: string
  folderId: string | null
  tags: string[]
  favorite: boolean
  createdAt: number
  updatedAt: number
  trashedAt: number | null
  hasTotp: boolean
  health: EntryHealth
  /** Lower-cased, non-secret text used for search. */
  searchText: string
}

export interface FolderView {
  id: string
  name: string
  parentId: string | null
  updatedAt: number
}

export interface VaultIndex {
  folders: FolderView[]
  entries: EntrySummary[]
}

export interface CustomFieldView {
  id: string
  label: string
  secret: boolean
  present: boolean
  /** Present only for non-secret custom fields. */
  value?: string
}

export interface HistoryView {
  index: number
  updatedAt: number
  title: string
  changed: string[]
  /** That revision's non-secret values, so a version can be compared in register. */
  fields: Record<string, string>
  /** Which secret fields held a value in that revision. Never their values. */
  secrets: Record<string, boolean>
  notes: string
  tags: string[]
}

export interface EntryDetail {
  id: string
  type: EntryType
  title: string
  folderId: string | null
  tags: string[]
  favorite: boolean
  createdAt: number
  updatedAt: number
  trashedAt: number | null
  /** Non-secret field values only. */
  fields: Record<string, string>
  /** Which secret fields hold a value. */
  secrets: Record<string, boolean>
  custom: CustomFieldView[]
  notes: string
  history: HistoryView[]
  health: EntryHealth
  hasTotp: boolean
  /** 0–4 strength score of the primary secret, when there is one. */
  strength: number | null
  /** Card helpers derived in the main process. */
  card?: { brand: string; last4: string }
  /** The ssh command for SSH entries (no secrets). */
  command?: string
}

export interface EntryInput {
  type: EntryType
  title: string
  folderId: string | null
  tags: string[]
  favorite?: boolean
  /** Field values. Secret fields omitted from an update keep their stored value. */
  fields: Record<string, string>
  custom: Array<{ id?: string; label: string; secret: boolean; value?: string }>
  notes: string
}

export interface TotpCode {
  code: string
  period: number
  expiresAt: number
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

export type KdfPreset = 'standard' | 'strong'

export interface KdfInfo {
  algorithm: 'argon2id'
  memoryKiB: number
  iterations: number
  parallelism: number
}

export interface VaultInfo {
  path: string
  fileName: string
  name: string
  vaultId: string
  kdf: KdfInfo
  cipher: 'xchacha20-poly1305'
  formatVersion: number
  lastSavedAt: number | null
  sizeBytes: number
}

export interface VaultFileInfo {
  path: string
  fileName: string
  vaultId: string
  kdf: KdfInfo
  formatVersion: number
  sizeBytes: number
  modifiedAt: number
}

export interface RecentVault {
  path: string
  name: string
  vaultId: string
  lastOpenedAt: number
}

export interface SyncLocation {
  id: string
  label: string
  path: string
  kind: 'icloud' | 'dropbox' | 'onedrive' | 'googledrive' | 'syncthing' | 'nextcloud' | 'documents'
}

export type BiometricKind = 'touch-id' | 'windows-hello' | 'fprintd' | 'none'

export interface BiometricInfo {
  kind: BiometricKind
  available: boolean
  /** Why biometrics are unavailable, in plain words. */
  reason?: string
  /** Whether the OS keystore is strong enough to hold a quick-unlock key. */
  secureStorage: boolean
}

export interface QuickUnlockState {
  enrolled: boolean
  expiresAt: number | null
  mode: 'session' | 'device'
}

export type ThemePref = 'system' | 'dark' | 'light'
export type TerminalPref = 'auto' | 'terminal' | 'iterm' | 'ghostty' | 'wezterm' | 'windows-terminal' | 'gnome-terminal' | 'konsole'

export interface Settings {
  theme: ThemePref
  autoLockMinutes: number
  lockOnSleep: boolean
  lockOnMinimize: boolean
  clipboardClearSeconds: number
  quickShortcut: string
  terminal: TerminalPref
  sshAgentLifetimeMinutes: number
  hideFromScreenCapture: boolean
  quickUnlockMode: 'session' | 'device'
  quickUnlockDays: number
}

export interface SyncStatus {
  state: 'idle' | 'saving' | 'saved' | 'merged' | 'error'
  at: number | null
  detail?: string
  conflicts?: number
}

export interface AppState {
  platform: 'darwin' | 'win32' | 'linux'
  locked: boolean
  vault: VaultInfo | null
  recent: RecentVault[]
  settings: Settings
  biometrics: BiometricInfo
  quickUnlock: Record<string, QuickUnlockState>
  sync: SyncStatus
}

export type LockReason = 'manual' | 'idle' | 'sleep' | 'screen-lock' | 'minimized' | 'password-changed-elsewhere' | 'error'

export type AppEvent =
  | { type: 'locked'; reason: LockReason }
  | { type: 'unlocked'; vault: VaultInfo }
  | { type: 'index-changed' }
  | { type: 'entry-changed'; id: string }
  | { type: 'sync'; status: SyncStatus }
  | { type: 'clipboard'; state: 'copied' | 'cleared'; label?: string; clearsAt?: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'focus-entry'; id: string }
  | { type: 'quick-shown' }
  | { type: 'command'; command: AppCommand }

export type AppCommand = 'new-entry' | 'search' | 'settings' | 'lock' | 'import' | 'security'

export type ErrorCode =
  | 'WRONG_PASSWORD'
  | 'CORRUPT'
  | 'UNSUPPORTED'
  | 'NOT_FOUND'
  | 'IO'
  | 'LOCKED'
  | 'INVALID'
  | 'BIOMETRIC_UNAVAILABLE'
  | 'BIOMETRIC_CANCELLED'
  | 'BIOMETRIC_EXPIRED'
  | 'NOT_ENROLLED'
  | 'SSH'
  | 'IMPORT'

export interface AppError {
  code: ErrorCode
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export interface GeneratorOptions {
  mode: 'characters' | 'passphrase'
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  avoidAmbiguous: boolean
  words: number
  separator: string
  capitalize: boolean
  includeNumber: boolean
}

export interface GeneratedSecret {
  value: string
  entropyBits: number
}

export interface StrengthEstimate {
  score: 0 | 1 | 2 | 3 | 4
  guessesLog10: number
  warning: string
  suggestions: string[]
  crackTime: string
}

export interface CopyReceipt {
  clearsAt: number | null
}

export interface ImportReport {
  /** Which KeePass format the file turned out to be. */
  format: 'kdbx' | 'kdb'
  folders: number
  entries: number
  ssh: number
  totp: number
  skipped: number
  /** Attachments left behind: this vault stores text, not files. */
  attachmentsSkipped: number
  folderName: string
}

export interface ImportInput {
  path: string
  password: string
  keyFilePath?: string
}
