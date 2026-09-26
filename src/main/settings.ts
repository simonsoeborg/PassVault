import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RecentVault, Settings, TerminalPref, ThemePref } from '../shared/types'

export const DEFAULT_SETTINGS: Settings = {
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

export const AUTO_LOCK_CHOICES = [0, 1, 2, 5, 10, 15, 30, 60]
export const CLIPBOARD_CHOICES = [0, 10, 20, 30, 60, 90]
export const QUICK_UNLOCK_DAYS = [1, 3, 7, 14, 30]
export const AGENT_LIFETIMES = [5, 15, 60, 240, 480, 1440]
const THEMES: ThemePref[] = ['system', 'dark', 'light']
const TERMINALS: TerminalPref[] = ['auto', 'terminal', 'iterm', 'ghostty', 'wezterm', 'windows-terminal', 'gnome-terminal', 'konsole']
const MAX_RECENT = 8

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function sanitize(input: Partial<Settings>, base: Settings): Settings {
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  const shortcut =
    typeof input.quickShortcut === 'string' && /^[A-Za-z0-9+]{1,60}$/.test(input.quickShortcut) ? input.quickShortcut : base.quickShortcut
  return {
    theme: pick(input.theme, THEMES, base.theme),
    autoLockMinutes: pick(input.autoLockMinutes, AUTO_LOCK_CHOICES, base.autoLockMinutes),
    lockOnSleep: bool(input.lockOnSleep, base.lockOnSleep),
    lockOnMinimize: bool(input.lockOnMinimize, base.lockOnMinimize),
    clipboardClearSeconds: pick(input.clipboardClearSeconds, CLIPBOARD_CHOICES, base.clipboardClearSeconds),
    quickShortcut: shortcut,
    terminal: pick(input.terminal, TERMINALS, base.terminal),
    sshAgentLifetimeMinutes: pick(input.sshAgentLifetimeMinutes, AGENT_LIFETIMES, base.sshAgentLifetimeMinutes),
    hideFromScreenCapture: bool(input.hideFromScreenCapture, base.hideFromScreenCapture),
    quickUnlockMode: pick(input.quickUnlockMode, ['session', 'device'] as const, base.quickUnlockMode),
    quickUnlockDays: pick(input.quickUnlockDays, QUICK_UNLOCK_DAYS, base.quickUnlockDays),
  }
}

interface Stored {
  settings: Settings
  recent: RecentVault[]
}

/** Per-device preferences and the recent-vault list. Holds no secrets. */
export class SettingsStore {
  private readonly path: string
  private data: Stored
  private writing: Promise<void> = Promise.resolve()

  constructor(directory = app.getPath('userData')) {
    this.path = join(directory, 'settings.json')
    this.data = this.load()
  }

  private load(): Stored {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<Stored>
      const recent = Array.isArray(raw.recent)
        ? raw.recent.filter(
            (r): r is RecentVault =>
              typeof r?.path === 'string' && typeof r.name === 'string' && typeof r.vaultId === 'string' && typeof r.lastOpenedAt === 'number',
          )
        : []
      return { settings: sanitize(raw.settings ?? {}, DEFAULT_SETTINGS), recent: recent.slice(0, MAX_RECENT) }
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, recent: [] }
    }
  }

  private persist(): void {
    const body = JSON.stringify(this.data, null, 2)
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temp = `${this.path}.${process.pid}.tmp`
      await writeFile(temp, body, { mode: 0o600 })
      await rename(temp, this.path)
    }).catch(() => {
      // Preferences failing to save must never take the vault down with them.
    })
  }

  get settings(): Settings {
    return { ...this.data.settings }
  }

  update(patch: Partial<Settings>): Settings {
    this.data.settings = sanitize({ ...this.data.settings, ...patch }, this.data.settings)
    this.persist()
    return this.settings
  }

  get recent(): RecentVault[] {
    return [...this.data.recent]
  }

  touchRecent(vault: Omit<RecentVault, 'lastOpenedAt'>): void {
    const rest = this.data.recent.filter((r) => r.path !== vault.path)
    this.data.recent = [{ ...vault, lastOpenedAt: Date.now() }, ...rest].slice(0, MAX_RECENT)
    this.persist()
  }

  forgetRecent(path: string): void {
    this.data.recent = this.data.recent.filter((r) => r.path !== path)
    this.persist()
  }

  flush(): Promise<void> {
    return this.writing
  }
}
