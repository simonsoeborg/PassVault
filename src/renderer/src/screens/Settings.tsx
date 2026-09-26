import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AppState, KdfPreset, Settings as SettingsValues, StrengthEstimate, TerminalPref, ThemePref } from '../../../shared/types'
import { BiometricOffer } from '../components/BiometricOffer'
import { Segmented, StrengthMeter, Switch, type ConfirmRequest } from '../components/ui'
import { formatShortcut, mebibytes, shortenPath } from '../lib/format'
import { api, notify, refreshApp } from '../store'
import type { Panel } from './VaultWindow'

const AUTO_LOCK = [
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 0, label: 'Never' },
]

const CLIPBOARD = [
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 90, label: '90 seconds' },
  { value: 0, label: 'Leave it' },
]

const QUICK_DAYS = [
  { value: 1, label: 'every day' },
  { value: 3, label: 'every 3 days' },
  { value: 7, label: 'every week' },
  { value: 14, label: 'every 2 weeks' },
  { value: 30, label: 'every month' },
]

const AGENT_LIFETIME = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' },
  { value: 1440, label: '24 hours' },
]

function terminalsFor(platform: AppState['platform']): Array<{ value: TerminalPref; label: string }> {
  if (platform === 'darwin') {
    return [
      { value: 'auto', label: 'Whatever is installed' },
      { value: 'terminal', label: 'Terminal' },
      { value: 'iterm', label: 'iTerm' },
      { value: 'ghostty', label: 'Ghostty' },
      { value: 'wezterm', label: 'WezTerm' },
    ]
  }
  if (platform === 'win32') {
    return [
      { value: 'auto', label: 'Whatever is installed' },
      { value: 'windows-terminal', label: 'Windows Terminal' },
      { value: 'terminal', label: 'Command Prompt' },
    ]
  }
  return [
    { value: 'auto', label: 'Whatever is installed' },
    { value: 'gnome-terminal', label: 'GNOME Terminal' },
    { value: 'konsole', label: 'Konsole' },
    { value: 'wezterm', label: 'WezTerm' },
  ]
}

export function Settings({ app, onClose, onPanel, confirm }: { app: AppState; onClose: () => void; onPanel: (panel: Panel) => void; confirm: (request: ConfirmRequest) => void }) {
  const settings = app.settings
  const vault = app.vault
  const [name, setName] = useState(vault?.name ?? '')

  const update = (patch: Partial<SettingsValues>) => void api().settings.update(patch)

  return (
    <section className="panel">
      <div className="panel-bar drag">
        <h1 className="panel-title">Settings</h1>
        <button type="button" className="btn btn-quiet btn-icon btn-sm no-drag" aria-label="Close settings" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="panel-scroll">
        <Group title="Locking">
          <Row label="Lock after inactivity" hint="Counts idle time across the whole computer, not just this window.">
            <Choice value={settings.autoLockMinutes} options={AUTO_LOCK} onChange={(autoLockMinutes) => update({ autoLockMinutes })} />
          </Row>
          <Row label="Lock when the computer sleeps" hint="Also locks when the screen locks.">
            <Switch label="Lock when the computer sleeps" checked={settings.lockOnSleep} onChange={(lockOnSleep) => update({ lockOnSleep })} />
          </Row>
          <Row label="Lock when the window is minimised">
            <Switch label="Lock when minimised" checked={settings.lockOnMinimize} onChange={(lockOnMinimize) => update({ lockOnMinimize })} />
          </Row>
          <Row label="Clear copied secrets after" hint="PassVault only clears the clipboard if it still holds what it put there.">
            <Choice value={settings.clipboardClearSeconds} options={CLIPBOARD} onChange={(clipboardClearSeconds) => update({ clipboardClearSeconds })} />
          </Row>
          <Row label="Hide windows from screen capture" hint="Screen sharing and screenshots see a blank window. Not supported by every Linux compositor.">
            <Switch
              label="Hide from screen capture"
              checked={settings.hideFromScreenCapture}
              onChange={(hideFromScreenCapture) => update({ hideFromScreenCapture })}
            />
          </Row>
        </Group>

        <Group title="Biometric unlock">
          <BiometricOffer app={app} />
          <Row label="Keep the key" hint="“Until PassVault quits” keeps it in memory only. “On this device” stores it in the system keystore so it survives a restart.">
            <Segmented
              label="Where the quick-unlock key is kept"
              value={settings.quickUnlockMode}
              onChange={(quickUnlockMode) => update({ quickUnlockMode })}
              options={[
                { value: 'session', label: 'Until PassVault quits' },
                { value: 'device', label: 'On this device' },
              ]}
            />
          </Row>
          <Row label="Ask for the master password" hint="Biometrics are a shortcut, never a replacement.">
            <Choice value={settings.quickUnlockDays} options={QUICK_DAYS} onChange={(quickUnlockDays) => update({ quickUnlockDays })} />
          </Row>
        </Group>

        <Group title="This vault">
          <Row label="Name" hint="Shown on the lock screen and in quick search.">
            <div className="settings-inline">
              <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
              <button
                type="button"
                className="btn"
                disabled={!name.trim() || name === vault?.name}
                onClick={async () => {
                  const result = await api().vault.rename(name.trim())
                  if (!result.ok) notify(result.error.message, 'alert')
                  else {
                    await refreshApp()
                    notify('Vault renamed')
                  }
                }}
              >
                Rename
              </button>
            </div>
          </Row>
          <Row label="File" hint={vault ? shortenPath(vault.path, 70) : ''}>
            <button type="button" className="btn" onClick={() => void api().vault.showInFolder()}>
              {app.platform === 'darwin' ? 'Show in Finder' : 'Show in Explorer'}
            </button>
          </Row>
          <Row label="Import" hint="Bring a KeePass .kdbx database into this vault.">
            <button type="button" className="btn" onClick={() => onPanel('import')}>
              Import from KeePass…
            </button>
          </Row>
          <Row label="What protects it" hint="Key derivation, cipher and the honest limits.">
            <button type="button" className="btn" onClick={() => onPanel('security')}>
              Vault security
            </button>
          </Row>
        </Group>

        <ChangePassword />

        <StrengthenKdf app={app} confirm={confirm} />

        <Group title="SSH">
          <Row label="Open connections in" hint="PassVault falls back to whatever it can find if this one is missing.">
            <Choice value={settings.terminal} options={terminalsFor(app.platform)} onChange={(terminal) => update({ terminal })} />
          </Row>
          <Row label="Keep keys in the agent for" hint="Loaded with ssh-add over stdin, so the key never lands on disk.">
            <Choice value={settings.sshAgentLifetimeMinutes} options={AGENT_LIFETIME} onChange={(sshAgentLifetimeMinutes) => update({ sshAgentLifetimeMinutes })} />
          </Row>
        </Group>

        <Group title="Quick search">
          <Row label="Shortcut" hint="Works from any app, and copies without switching windows.">
            <ShortcutRecorder value={settings.quickShortcut} platform={app.platform} onChange={(quickShortcut) => update({ quickShortcut })} />
          </Row>
        </Group>

        <Group title="Appearance">
          <Row label="Theme">
            <Segmented
              label="Theme"
              value={settings.theme}
              onChange={(theme: ThemePref) => update({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Plate' },
                { value: 'light', label: 'Paper' },
              ]}
            />
          </Row>
        </Group>

        <p className="panel-foot">
          Passphrase words come from the EFF long wordlist, used under CC BY 3.0 US. Key derivation is Argon2id; the vault body is sealed with
          XChaCha20-Poly1305.
        </p>
      </div>
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="settings-heading caps">{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-text">
        <p className="settings-label">{label}</p>
        {hint ? <p className="settings-hint">{hint}</p> : null}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  )
}

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (next: T) => void }) {
  return (
    <select
      className="input settings-select"
      value={String(value)}
      onChange={(event) => {
        const raw = event.target.value
        const match = options.find((option) => String(option.value) === raw)
        if (match) onChange(match.value)
      }}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ShortcutRecorder({ value, platform, onChange }: { value: string; platform: AppState['platform']; onChange: (accelerator: string) => void }) {
  const [recording, setRecording] = useState(false)
  return (
    <button
      type="button"
      className={`btn shortcut${recording ? ' is-recording' : ''}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return
        event.preventDefault()
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
        if (event.key === 'Escape') {
          setRecording(false)
          return
        }
        const parts: string[] = []
        if (event.metaKey || event.ctrlKey) parts.push('CommandOrControl')
        if (event.altKey) parts.push('Alt')
        if (event.shiftKey) parts.push('Shift')
        if (!parts.length) return
        parts.push(event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key)
        onChange(parts.join('+'))
        setRecording(false)
      }}
    >
      {recording ? 'Press the keys…' : formatShortcut(value, platform)}
    </button>
  )
}

function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [estimate, setEstimate] = useState<StrengthEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!next) {
      setEstimate(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void api()
        .vault.estimateStrength(next)
        .then((result) => live && setEstimate(result))
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [next])

  const ready = current && next.length >= 8 && next === confirmValue && (estimate?.score ?? 0) >= 3 && !busy

  return (
    <Group title="Master password">
      <form
        className="settings-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!ready) return
          setBusy(true)
          setError(null)
          const result = await api().vault.changePassword({ current, next })
          setBusy(false)
          if (!result.ok) {
            setError(result.error.message)
            return
          }
          setCurrent('')
          setNext('')
          setConfirmValue('')
          await refreshApp()
          notify('Master password changed. Biometric unlock was turned off — switch it on again to re-enrol.')
        }}
      >
        <p className="settings-hint">
          Changing it re-seals the file with a fresh salt. Other devices need the new password the next time they open the vault.
        </p>
        <div className="settings-form-grid">
          <label className="field-stack">
            <span className="caps">Current</span>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </label>
          <label className="field-stack">
            <span className="caps">New</span>
            <input className="input mono" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
          </label>
          <label className="field-stack">
            <span className="caps">Confirm</span>
            <input
              className="input mono"
              type="password"
              autoComplete="new-password"
              value={confirmValue}
              aria-invalid={Boolean(confirmValue) && confirmValue !== next}
              onChange={(event) => setConfirmValue(event.target.value)}
            />
          </label>
        </div>
        {next ? <StrengthMeter estimate={estimate} empty={false} /> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn-primary" disabled={!ready} aria-busy={busy}>
            {busy ? 'Re-sealing…' : 'Change master password'}
          </button>
        </div>
      </form>
    </Group>
  )
}

function StrengthenKdf({ app, confirm }: { app: AppState; confirm: (request: ConfirmRequest) => void }) {
  const [preset, setPreset] = useState<KdfPreset>(app.vault && app.vault.kdf.memoryKiB >= 524_288 ? 'strong' : 'standard')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vault = app.vault
  if (!vault) return null

  const currentIsStrong = vault.kdf.memoryKiB >= 524_288

  return (
    <Group title="Key derivation">
      <Row
        label="Now in use"
        hint={`Argon2id · ${mebibytes(vault.kdf.memoryKiB)} · ${vault.kdf.iterations} passes · ${vault.kdf.parallelism} lane. Every password guess an attacker makes costs this much memory and time.`}
      >
        <Segmented
          label="Key derivation strength"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'strong', label: 'Strong' },
          ]}
        />
      </Row>
      {(preset === 'strong') !== currentIsStrong ? (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault()
            confirm({
              title: preset === 'strong' ? 'Strengthen key derivation?' : 'Lower key derivation?',
              body:
                preset === 'strong'
                  ? 'The vault is re-sealed with 512 MiB and 4 passes. Unlocking gets slower on every device, including slower laptops and phones opening the same file.'
                  : 'The vault is re-sealed with 128 MiB and 3 passes — faster to open, and cheaper to attack.',
              confirmLabel: 'Re-seal vault',
              onConfirm: async () => {
                setBusy(true)
                setError(null)
                const result = await api().vault.setKdf({ preset, password })
                setBusy(false)
                if (!result.ok) {
                  setError(result.error.message)
                  return
                }
                setPassword('')
                await refreshApp()
                notify('Vault re-sealed. Biometric unlock was turned off — switch it on again to re-enrol.')
              },
            })
          }}
        >
          <div className="settings-inline">
            <input
              className="input"
              type="password"
              placeholder="Master password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!password || busy} aria-busy={busy}>
              {busy ? 'Re-sealing…' : 'Apply'}
            </button>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </Group>
  )
}
