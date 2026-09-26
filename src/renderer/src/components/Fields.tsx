import { useEffect, useState, type ReactNode } from 'react'
import type { TotpCode } from '../../../shared/types'
import { api } from '../store'

export function FieldRow({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="field">
      <dt className="field-label caps">{label}</dt>
      <dd className="field-value">{children}</dd>
      {actions ? <div className="field-actions">{actions}</div> : null}
    </div>
  )
}

/** The fine-line underprint that stands in for a value the vault has not released. */
export function SealedBand({ label = 'Sealed' }: { label?: string }) {
  return <span className="sealed" role="img" aria-label={label} />
}

/**
 * Digits in fixed cells. Grouped numbers wrap by whole groups, so every line of a
 * long number starts on the same left edge — the register the world is named for.
 */
export function DigitCells({ value, group }: { value: string; group?: number }) {
  const characters = [...value]
  if (!group) {
    return (
      <span className="cells">
        {characters.map((character, index) => (
          <span key={index}>{character}</span>
        ))}
      </span>
    )
  }
  const groups: string[][] = []
  for (let index = 0; index < characters.length; index += group) groups.push(characters.slice(index, index + group))
  return (
    <span className="cells cells-grouped">
      {groups.map((cluster, clusterIndex) => (
        <span className="cell-group" key={clusterIndex}>
          {cluster.map((character, index) => (
            <span key={index}>{character}</span>
          ))}
        </span>
      ))}
    </span>
  )
}

export function TotpCells({ entryId }: { entryId: string }) {
  const [code, setCode] = useState<TotpCode | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    let refresh: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const result = await api().entries.totp(entryId)
      if (!live) return
      if (result.ok && result.value) {
        setCode(result.value)
        setInvalid(false)
        refresh = setTimeout(load, Math.max(400, result.value.expiresAt - Date.now() + 60))
      } else {
        setCode(null)
        setInvalid(true)
      }
    }
    void load()
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => {
      live = false
      if (refresh) clearTimeout(refresh)
      clearInterval(tick)
    }
  }, [entryId])

  if (invalid) return <span className="field-plain">This code could not be read. Re-add the setup key.</span>
  if (!code) return <SealedBand label="Loading code" />

  const remainingMs = Math.max(0, code.expiresAt - now)
  const seconds = Math.ceil(remainingMs / 1000)
  const digits = [...code.code]
  const half = Math.ceil(digits.length / 2)

  return (
    <span className="totp" data-low={seconds <= 5 ? 'true' : 'false'}>
      <span className="cells cells-grouped totp-cells">
        <span className="cell-group">
          {digits.slice(0, half).map((digit, index) => (
            <span key={index}>{digit}</span>
          ))}
        </span>
        <span className="cell-group">
          {digits.slice(half).map((digit, index) => (
            <span key={index}>{digit}</span>
          ))}
        </span>
      </span>
      <span className="totp-track" aria-hidden="true">
        <span className="totp-fill" style={{ transform: `scaleX(${remainingMs / (code.period * 1000)})` }} />
      </span>
      <span className="totp-seconds mono">{seconds}s</span>
    </span>
  )
}

/** The machine-readable line: the command this entry exists to run. */
export function MrzStrip({ command, onCopy }: { command: string; onCopy: () => void }) {
  return (
    <button type="button" className="mrz" onClick={onCopy} title="Copy this command">
      <span className="mrz-text mono">{command}</span>
      <span className="mrz-fill mono" aria-hidden="true">
        {'<'.repeat(240)}
      </span>
      <span className="mrz-hint caps">Copy</span>
    </button>
  )
}
