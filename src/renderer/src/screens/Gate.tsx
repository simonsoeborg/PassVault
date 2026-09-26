import { ArrowLeft, Dices, Eye, EyeOff, Fingerprint, FolderOpen, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppState, BiometricKind, KdfPreset, RecentVault, StrengthEstimate, SyncLocation, VaultFileInfo } from '../../../shared/types'
import { Rosette, type RosetteState } from '../components/Rosette'
import { StrengthMeter, useMenu } from '../components/ui'
import { locationLabel, mebibytes, shortenPath } from '../lib/format'
import { vaultCode } from '../lib/rosette'
import { api, setGateHold } from '../store'

export function Gate({ app }: { app: AppState }) {
  const [mode, setMode] = useState<'unlock' | 'welcome' | 'create'>(app.recent.length ? 'unlock' : 'welcome')
  const [target, setTarget] = useState<RecentVault | null>(app.recent[0] ?? null)
  const [openError, setOpenError] = useState<string | null>(null)

  const openExisting = async () => {
    const path = await api().vault.chooseExisting()
    if (!path) return
    const info = await api().vault.inspect(path)
    if (!info.ok) {
      setOpenError(info.error.message)
      setMode(target ? 'unlock' : 'welcome')
      return
    }
    const fileName = path.split(/[\\/]/).pop() ?? 'Vault'
    setOpenError(null)
    setTarget({ path, name: fileName.replace(/\.pvault$/i, ''), vaultId: info.value.vaultId, lastOpenedAt: 0 })
    setMode('unlock')
  }

  if (mode === 'create') {
    return <CreateVault app={app} onBack={() => setMode(target ? 'unlock' : 'welcome')} />
  }
  if (mode === 'unlock' && target) {
    return (
      <Unlock
        app={app}
        target={target}
        error={openError}
        onSwitch={(next) => {
          setOpenError(null)
          setTarget(next)
        }}
        onOpen={openExisting}
        onCreate={() => setMode('create')}
      />
    )
  }
  return <Welcome error={openError} onCreate={() => setMode('create')} onOpen={openExisting} />
}

function biometricLabel(kind: BiometricKind): string {
  if (kind === 'touch-id') return 'Touch ID'
  if (kind === 'windows-hello') return 'Windows Hello'
  if (kind === 'fprintd') return 'your fingerprint'
  return 'biometrics'
}

function BiometricIcon({ kind }: { kind: BiometricKind }) {
  return kind === 'windows-hello' ? <ScanFace /> : <Fingerprint />
}

// ------------------------------------------------------------------- unlock

function Unlock({
  app,
  target,
  error: outerError,
  onSwitch,
  onOpen,
  onCreate,
}: {
  app: AppState
  target: RecentVault
  error: string | null
  onSwitch: (vault: RecentVault) => void
  onOpen: () => void
  onCreate: () => void
}) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'deriving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(outerError)
  const [knock, setKnock] = useState(0)
  const [capsLock, setCapsLock] = useState(false)
  const [file, setFile] = useState<VaultFileInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const { menu, openUnder } = useMenu()

  const quick = app.quickUnlock[target.vaultId]
  const canBiometric = Boolean(quick?.enrolled && app.biometrics.available)

  useEffect(() => {
    setError(outerError)
  }, [outerError])

  useEffect(() => {
    let live = true
    setFile(null)
    setMissing(false)
    void api()
      .vault.inspect(target.path)
      .then((result) => {
        if (!live) return
        if (result.ok) setFile(result.value)
        else {
          setMissing(result.error.code === 'NOT_FOUND')
          setError(result.error.message)
        }
      })
    return () => {
      live = false
    }
  }, [target.path])

  const rosetteState: RosetteState = phase === 'deriving' ? 'deriving' : phase === 'done' ? 'registered' : knock ? 'knock' : 'locked'

  const fail = (message: string) => {
    setGateHold(false)
    setPhase('idle')
    setError(message)
    setKnock((count) => count + 1)
    inputRef.current?.select()
  }

  const succeed = () => {
    setPassword('')
    setPhase('done')
    setError(null)
    // Hold the screen just long enough for the rosette to come into register.
    setTimeout(() => setGateHold(false), 460)
  }

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!password || phase === 'deriving') return
    setGateHold(true)
    setPhase('deriving')
    setError(null)
    const result = await api().vault.unlock({ path: target.path, password })
    if (result.ok) succeed()
    else fail(result.error.message)
  }

  const useBiometrics = async () => {
    if (phase === 'deriving') return
    setGateHold(true)
    setPhase('deriving')
    setError(null)
    const result = await api().vault.unlockWithBiometrics(target.path)
    if (result.ok) succeed()
    else {
      fail(result.error.message)
      inputRef.current?.focus()
    }
  }

  const switchItems = [
    ...app.recent.map((recent) => ({
      label: recent.name,
      hint: locationLabel(recent.path),
      checked: recent.path === target.path,
      onSelect: () => onSwitch(recent),
    })),
    { separator: true },
    { label: 'Open another vault…', onSelect: onOpen },
    { label: 'Create a new vault…', onSelect: onCreate },
  ]

  return (
    <div className="gate">
      <div className="gate-drag drag" />
      <main className="unlock">
        <Rosette id={target.vaultId} size={252} state={rosetteState} key={`${target.vaultId}-${knock}`} />
        <h1 className="unlock-name">{target.name}</h1>
        <p className="unlock-meta mono">
          {vaultCode(target.vaultId)} · {locationLabel(target.path)}
        </p>

        {missing ? (
          <div className="unlock-missing">
            <p>{error}</p>
            <div className="unlock-missing-actions">
              <button type="button" className="btn btn-primary" onClick={onOpen}>
                <FolderOpen /> Find the file…
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await api().vault.forgetRecent(target.path)
                  const next = app.recent.find((recent) => recent.path !== target.path)
                  if (next) onSwitch(next)
                  else onCreate()
                }}
              >
                Forget this vault
              </button>
            </div>
          </div>
        ) : (
          <>
            {canBiometric ? (
              <button type="button" className="btn btn-primary btn-lg unlock-bio" onClick={useBiometrics} aria-busy={phase === 'deriving'}>
                <BiometricIcon kind={app.biometrics.kind} /> Unlock with {biometricLabel(app.biometrics.kind)}
              </button>
            ) : null}

            <form className="unlock-form" onSubmit={submit}>
              <label className="visually-hidden" htmlFor="master-password">
                Master password
              </label>
              <div className="input-wrap">
                <input
                  id="master-password"
                  ref={inputRef}
                  className="input input-lg"
                  type={show ? 'text' : 'password'}
                  placeholder="Master password"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                  onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                />
                <button
                  type="button"
                  className="btn btn-quiet btn-icon btn-sm input-adorn"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow((value) => !value)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <button type="submit" className={`btn btn-lg ${canBiometric ? '' : 'btn-primary'}`} disabled={!password} aria-busy={phase === 'deriving'}>
                {phase === 'deriving' ? 'Opening…' : 'Unlock'}
              </button>
            </form>

            <p className={`unlock-error${error ? ' is-shown' : ''}`} role="alert">
              {error ?? (capsLock ? 'Caps Lock is on.' : '')}
            </p>
          </>
        )}

        <button type="button" ref={switchRef} className="btn btn-quiet btn-sm unlock-switch" onClick={() => openUnder(switchRef.current, switchItems)}>
          Switch vault
        </button>
      </main>

      <footer className="gate-foot mono">
        {file
          ? `Argon2id · ${mebibytes(file.kdf.memoryKiB)} · ${file.kdf.iterations} passes → XChaCha20-Poly1305 · ${file.fileName} in ${locationLabel(target.path)}`
          : shortenPath(target.path)}
      </footer>
      {menu}
    </div>
  )
}

// ------------------------------------------------------------------ welcome

function Welcome({ error, onCreate, onOpen }: { error: string | null; onCreate: () => void; onOpen: () => void }) {
  return (
    <div className="gate">
      <div className="gate-drag drag" />
      <main className="welcome">
        <Rosette id="passvault-specimen" size={96} state="registered" className="welcome-mark" />
        <h1 className="welcome-title">Every password and server key in one file you own.</h1>
        <p className="welcome-body">
          PassVault seals a single vault file with your master password. Keep it in a folder you already sync, and the same vault opens on every computer you
          use.
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onCreate}>
            Create a vault
          </button>
          <button type="button" className="btn btn-lg" onClick={onOpen}>
            <FolderOpen /> Open an existing vault…
          </button>
        </div>
        {error ? (
          <p className="unlock-error is-shown" role="alert">
            {error}
          </p>
        ) : null}
        <p className="welcome-note">Coming from KeePass? Create a vault first, then import your .kdbx file into it.</p>
      </main>
      <footer className="gate-foot mono">Argon2id key derivation · XChaCha20-Poly1305 encryption · no account, no server</footer>
    </div>
  )
}

// ------------------------------------------------------------------- create

const KDF_CHOICES: Array<{ value: KdfPreset; title: string; body: string }> = [
  { value: 'standard', title: 'Standard', body: '128 MiB and 3 passes of Argon2id. Opens in about half a second on a current laptop.' },
  { value: 'strong', title: 'Strong', body: '512 MiB and 4 passes. Roughly five times slower to open — and five times more expensive to attack.' },
]

function CreateVault({ app, onBack }: { app: AppState; onBack: () => void }) {
  const separator = app.platform === 'win32' ? '\\' : '/'
  const [name, setName] = useState('Personal')
  const [locations, setLocations] = useState<SyncLocation[]>([])
  const [directory, setDirectory] = useState<string | null>(null)
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [preset, setPreset] = useState<KdfPreset>('standard')
  const [estimate, setEstimate] = useState<StrengthEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api()
      .vault.suggestLocations()
      .then((found) => {
        setLocations(found)
        setDirectory((current) => current ?? found[0]?.path ?? null)
      })
  }, [])

  useEffect(() => {
    if (!password) {
      setEstimate(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void api()
        .vault.estimateStrength(password)
        .then((result) => {
          if (live) setEstimate(result)
        })
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [password])

  const fileName = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Vault'}.pvault`
  const path = customPath ?? (directory ? `${directory}${separator}${fileName}` : null)
  const chosen = locations.find((location) => location.path === directory)
  const strongEnough = (estimate?.score ?? 0) >= 3
  const ready = Boolean(path) && password.length >= 8 && password === confirm && strongEnough && !busy

  const generate = async () => {
    const secret = await api().generator.generate({
      mode: 'passphrase',
      length: 24,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: true,
      words: 6,
      separator: '-',
      capitalize: false,
      includeNumber: false,
    })
    setPassword(secret.value)
    setConfirm('')
    setShow(true)
  }

  const create = async () => {
    if (!path) return
    setBusy(true)
    setError(null)
    const result = await api().vault.create({ path, name: name.trim() || 'Vault', password, kdf: preset })
    if (!result.ok) {
      setBusy(false)
      setError(result.error.message)
    }
  }

  return (
    <div className="gate">
      <div className="gate-drag drag" />
      <main className="create">
        <header className="create-head">
          <button type="button" className="btn btn-quiet btn-sm" onClick={onBack}>
            <ArrowLeft /> Back
          </button>
          <h1>Create a vault</h1>
        </header>

        <form
          className="create-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) void create()
          }}
        >
          <div className="form-row">
            <label className="form-label caps" htmlFor="vault-name">
              Name
            </label>
            <input id="vault-name" className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          </div>

          <div className="form-row">
            <span className="form-label caps">Location</span>
            <div className="locations">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className="location"
                  aria-pressed={!customPath && directory === location.path}
                  onClick={() => {
                    setCustomPath(null)
                    setDirectory(location.path)
                  }}
                >
                  <span className="location-label">{location.label}</span>
                  <span className="location-path mono">{shortenPath(location.path, 34)}</span>
                </button>
              ))}
              <button
                type="button"
                className="location"
                aria-pressed={Boolean(customPath)}
                onClick={async () => {
                  const picked = await api().vault.chooseNewPath({ name: name.trim() || 'Vault', directory: directory ?? undefined })
                  if (picked) setCustomPath(picked)
                }}
              >
                <span className="location-label">Another folder…</span>
                <span className="location-path mono">{customPath ? shortenPath(customPath, 34) : 'Choose where the file lives'}</span>
              </button>
            </div>
            <p className="form-hint">
              {path ? (
                <>
                  Saved as <span className="mono">{fileName}</span> in {chosen?.label ?? locationLabel(path)}.{' '}
                  {chosen && chosen.kind !== 'documents'
                    ? `${chosen.label} carries it to your other computers.`
                    : 'This folder is not synced — you can move the file into a synced folder whenever you like.'}
                </>
              ) : (
                'Choose where the vault file should live.'
              )}
            </p>
          </div>

          <div className="form-row">
            <label className="form-label caps" htmlFor="new-password">
              Master password
            </label>
            <div className="password-row">
              <div className="input-wrap">
                <input
                  id="new-password"
                  className="input mono"
                  type={show ? 'text' : 'password'}
                  value={password}
                  autoComplete="new-password"
                  spellCheck={false}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-quiet btn-icon btn-sm input-adorn"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow((value) => !value)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <button type="button" className="btn" onClick={generate}>
                <Dices /> Suggest a passphrase
              </button>
            </div>
            <StrengthMeter estimate={estimate} empty={!password} />
          </div>

          <div className="form-row">
            <label className="form-label caps" htmlFor="confirm-password">
              Confirm
            </label>
            <input
              id="confirm-password"
              className="input mono"
              type={show ? 'text' : 'password'}
              value={confirm}
              autoComplete="new-password"
              spellCheck={false}
              aria-invalid={confirm.length > 0 && confirm !== password}
              onChange={(event) => setConfirm(event.target.value)}
            />
            {confirm.length > 0 && confirm !== password ? <p className="form-error">The two passwords are different.</p> : null}
          </div>

          <div className="form-row">
            <span className="form-label caps">Key derivation</span>
            <div className="choice-list">
              {KDF_CHOICES.map((choice) => (
                <button key={choice.value} type="button" className="choice" aria-pressed={preset === choice.value} onClick={() => setPreset(choice.value)}>
                  <span className="choice-title">{choice.title}</span>
                  <span className="choice-body">{choice.body}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="create-warning">
            Nobody can recover a forgotten master password — not us, not a support line. Write it down and keep the paper somewhere safe.
          </p>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="create-actions">
            <button type="submit" className="btn btn-primary btn-lg" disabled={!ready} aria-busy={busy}>
              {busy ? 'Sealing the vault…' : 'Create vault'}
            </button>
            {!strongEnough && password ? <span className="create-gate-note">Aim for “Strong” before creating the vault.</span> : null}
          </div>
        </form>
      </main>
    </div>
  )
}
