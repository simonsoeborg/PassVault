import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EntrySummary } from '../../../shared/types'
import { Rosette } from '../components/Rosette'
import { Keycap } from '../components/ui'
import { connectSsh, copyField, copySshCommand, openUrl, primaryFieldFor } from '../lib/actions'
import { TYPE_META } from '../lib/entryTypes'
import { locationLabel, modKey } from '../lib/format'
import { searchEntries } from '../lib/search'
import { applyTheme } from '../lib/theme'
import { api, boot, onCommand, refreshIndex, useStore } from '../store'

const RESULT_LIMIT = 7

export function QuickApp() {
  const app = useStore((s) => s.app)
  const index = useStore((s) => s.index)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [receipt, setReceipt] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const theme = app?.settings.theme ?? 'system'

  useEffect(() => {
    void boot()
  }, [])

  useEffect(() => applyTheme(theme), [theme])

  useEffect(
    () =>
      onCommand((command) => {
        if (command !== 'search') return
        setQuery('')
        setCursor(0)
        setReceipt(null)
        void refreshIndex()
        inputRef.current?.focus()
      }),
    [],
  )

  const results = useMemo(
    () => searchEntries((index?.entries ?? []).filter((entry) => !entry.trashedAt), query, RESULT_LIMIT),
    [index, query],
  )

  const selected = results[Math.min(cursor, results.length - 1)]

  const finish = (message: string) => {
    setReceipt(message)
    setTimeout(() => {
      setReceipt(null)
      void api().window.hideQuick()
    }, 640)
  }

  const primary = async (entry: EntrySummary) => {
    if (entry.type === 'ssh') {
      await connectSsh(entry.id)
      finish('Connecting…')
      return
    }
    const field = primaryFieldFor(entry.type)
    if (!field) return
    await copyField(entry.id, field)
    finish(`${entry.type === 'login' ? 'Password' : 'Secret'} copied`)
  }

  const secondary = async (entry: EntrySummary) => {
    if (entry.type === 'ssh') {
      await copySshCommand(entry.id)
      finish('Command copied')
      return
    }
    if (entry.hasTotp) {
      await copyField(entry.id, 'totp')
      finish('One-time code copied')
      return
    }
    const detail = await api().entries.get(entry.id)
    const url = detail.ok ? detail.value.fields.url : ''
    if (url) {
      await openUrl(url)
      finish('Opening website')
      return
    }
    await api().window.showMain(entry.id)
  }

  const onKeyDown = async (event: React.KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey
    if (event.key === 'Escape') {
      event.preventDefault()
      await api().window.hideQuick()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => Math.min(results.length - 1, value + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => Math.max(0, value - 1))
      return
    }
    if (!selected) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (mod) await secondary(selected)
      else await primary(selected)
      return
    }
    if (mod && event.key.toLowerCase() === 'u') {
      event.preventDefault()
      await copyField(selected.id, 'username')
      finish('Username copied')
      return
    }
    if (mod && event.key.toLowerCase() === 'o') {
      event.preventDefault()
      await api().window.showMain(selected.id)
    }
  }

  if (!app) return <div className="quick" />

  if (!app.vault) {
    return (
      <div className="quick quick-locked">
        <Rosette id={app.recent[0]?.vaultId ?? 'passvault-specimen'} size={96} state="locked" />
        <p className="quick-locked-title">{app.recent.length ? `“${app.recent[0].name}” is locked.` : 'No vault yet.'}</p>
        <p className="quick-locked-body">
          {app.recent.length ? 'Open PassVault to unlock it — quick search never holds the key on its own.' : 'Create a vault in PassVault to get started.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void api().window.showMain()}>
          Open PassVault
        </button>
      </div>
    )
  }

  const mod = modKey(app.platform)

  return (
    <div className="quick" onKeyDown={onKeyDown}>
      <div className="quick-bar">
        <Rosette id={app.vault.vaultId} size={30} />
        <Search className="quick-search-icon" />
        <input
          ref={inputRef}
          className="quick-input"
          placeholder={`Search ${app.vault.name}`}
          value={query}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
        />
        <Keycap>esc</Keycap>
      </div>

      <div className="quick-results" role="listbox" aria-label="Results">
        {results.map((entry, position) => (
          <div
            key={entry.id}
            role="option"
            aria-selected={entry === selected}
            data-type={entry.type}
            className={`quick-row${entry === selected ? ' is-selected' : ''}`}
            onMouseMove={() => setCursor(position)}
            onClick={() => void primary(entry)}
          >
            <span className="quick-mark">{TYPE_META[entry.type].mark}</span>
            <span className="quick-title">{entry.title}</span>
            <span className="quick-sub mono">{entry.subtitle}</span>
            {entry === selected ? <CornerDownLeft className="quick-enter" /> : null}
          </div>
        ))}

        {!results.length ? (
          <p className="quick-empty">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : `${index?.entries.length ?? 0} entries. Start typing.`}
          </p>
        ) : null}
      </div>

      <div className="quick-foot">
        {receipt ? (
          <span className="quick-receipt">{receipt}</span>
        ) : (
          <>
            <span className="quick-keys">
              <Keycap>↵</Keycap> {selected?.type === 'ssh' ? 'connect' : 'copy secret'}
            </span>
            <span className="quick-keys">
              <Keycap>{mod}↵</Keycap>{' '}
              {selected?.type === 'ssh'
                ? 'copy command'
                : selected?.hasTotp
                  ? 'copy 2FA code'
                  : selected?.type === 'login'
                    ? 'open website'
                    : 'open in PassVault'}
            </span>
            <span className="quick-keys">
              <Keycap>{mod}U</Keycap> username
            </span>
            <span className="quick-keys">
              <Keycap>{mod}O</Keycap> open in PassVault
            </span>
            <span className="quick-where mono">{locationLabel(app.vault.path)}</span>
          </>
        )}
      </div>
    </div>
  )
}
