import { Fingerprint, ScanFace } from 'lucide-react'
import { useState } from 'react'
import type { AppState } from '../../../shared/types'
import { api, notify, refreshApp } from '../store'

function label(kind: AppState['biometrics']['kind']): string {
  if (kind === 'touch-id') return 'Touch ID'
  if (kind === 'windows-hello') return 'Windows Hello'
  if (kind === 'fprintd') return 'your fingerprint'
  return 'biometrics'
}

/**
 * Turning on quick unlock needs the master password once: it proves the person at the
 * keyboard owns the vault before the key is handed to the OS keystore.
 */
export function BiometricOffer({ app, compact }: { app: AppState; compact?: boolean }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = app.vault ? app.quickUnlock[app.vault.vaultId] : undefined
  const kind = app.biometrics.kind

  if (!app.biometrics.available) {
    return (
      <p className="offer-unavailable">
        {app.biometrics.reason ?? 'Biometric unlock is not available on this device.'} Your master password always works.
      </p>
    )
  }

  if (state?.enrolled) {
    return (
      <div className="offer is-on">
        <div className="offer-text">
          <p className="offer-title">
            {label(kind)} unlock is on for this device
            {state.mode === 'session' ? ', until PassVault quits' : ''}.
          </p>
          <p className="offer-body">
            {state.expiresAt
              ? `Your master password is required again after ${new Date(state.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`
              : 'Your master password is required again when it expires.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await api().biometrics.disenroll()
            await refreshApp()
            notify(`${label(kind)} unlock turned off`)
          }}
        >
          Turn off
        </button>
      </div>
    )
  }

  const enroll = async () => {
    setBusy(true)
    setError(null)
    const result = await api().biometrics.enroll(password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setPassword('')
    await refreshApp()
    notify(`${label(kind)} unlock is on for this device`)
  }

  return (
    <div className="offer">
      <div className="offer-text">
        <p className="offer-title">
          {kind === 'windows-hello' ? <ScanFace /> : <Fingerprint />} Unlock with {label(kind)} next time
        </p>
        {compact ? null : (
          <p className="offer-body">
            The key stays in this computer’s keystore, is released only after a biometric check, and your master password is still required weekly.
          </p>
        )}
      </div>
      <form
        className="offer-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (password && !busy) void enroll()
        }}
      >
        <input
          className="input"
          type="password"
          placeholder="Master password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        <button type="submit" className="btn btn-primary" disabled={!password} aria-busy={busy}>
          Turn on
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
