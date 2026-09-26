import { Ellipsis, ExternalLink, KeyRound, Star, Terminal } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { AppState, EntryDetail, EntrySummary, EntryType, FolderView, HistoryView } from '../../../shared/types'
import { BiometricOffer } from '../components/BiometricOffer'
import { DigitCells, FieldRow, MrzStrip, SealedBand, TotpCells } from '../components/Fields'
import { Rosette } from '../components/Rosette'
import { Keycap, LargeType, useMenu, type ConfirmRequest } from '../components/ui'
import { addSshKey, connectSsh, copyField, copySshCommand, openUrl } from '../lib/actions'
import { FIELD_DEFS, TYPE_META, primaryAction, sshAuth, type FieldDef } from '../lib/entryTypes'
import { locationLabel, modKey, relativeTime, shortDate } from '../lib/format'
import { vaultCode } from '../lib/rosette'
import type { View } from '../lib/views'
import { api, folderPath, notify, onEntryChanged, useStore } from '../store'
import type { Panel } from './VaultWindow'

const RESEAL_MS = 30_000
const STRENGTH_WORDS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']

const AUTH_LABEL: Record<string, string> = {
  key: 'Private key from this vault',
  password: 'Password from this vault',
  agent: 'A key already in your SSH agent',
}

interface EntryPaneProps {
  entryId: string
  app: AppState
  folders: FolderView[]
  onEdit: () => void
  onView: (view: View) => void
  confirm: (request: ConfirmRequest) => void
}

export function EntryPane({ entryId, app, folders, onEdit, onView, confirm }: EntryPaneProps) {
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [large, setLarge] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [compare, setCompare] = useState<number | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const moreRef = useRef<HTMLButtonElement>(null)
  const { menu, openUnder } = useMenu()

  const load = async () => {
    const result = await api().entries.get(entryId)
    if (result.ok) setDetail(result.value)
    else setError(result.error.message)
  }

  useEffect(() => {
    setDetail(null)
    setRevealed({})
    setError(null)
    setCompare(null)
    void load()
    return onEntryChanged((id) => {
      if (id === entryId) void load()
    })
  }, [entryId])

  useEffect(() => {
    const running = timers.current
    return () => {
      for (const timer of Object.values(running)) clearTimeout(timer)
    }
  }, [])

  const reveal = async (ref: string, then?: (value: string) => void) => {
    const result = await api().entries.reveal(entryId, ref)
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    setRevealed((current) => ({ ...current, [ref]: result.value }))
    clearTimeout(timers.current[ref])
    timers.current[ref] = setTimeout(() => hide(ref), RESEAL_MS)
    then?.(result.value)
  }

  const hide = (ref: string) => {
    clearTimeout(timers.current[ref])
    setRevealed((current) => {
      const next = { ...current }
      delete next[ref]
      return next
    })
  }

  const showLarge = async (ref: string, label: string) => {
    const existing = revealed[ref]
    if (existing !== undefined) {
      setLarge({ label, value: existing })
      return
    }
    await reveal(ref, (value) => setLarge({ label, value }))
  }

  if (error && !detail) {
    return (
      <article className="page">
        <div className="page-bar drag" />
        <div className="page-scroll">
          <p className="page-error">{error}</p>
        </div>
      </article>
    )
  }
  if (!detail) return <article className="page" />

  const meta = TYPE_META[detail.type]
  const path = folderPath(folders, detail.folderId)
  const primary = primaryAction(detail.type, detail.secrets, detail.fields)
  const mod = modKey(app.platform)

  const runPrimaryAction = () => {
    if (primary.kind === 'connect') return void connectSsh(detail.id)
    if (primary.kind === 'copy' && primary.field) return void copyField(detail.id, primary.field)
    if (primary.kind === 'edit') return onEdit()
  }

  const trash = async () => {
    const result = await api().entries.trash([detail.id])
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    notify(`Moved “${detail.title}” to Trash`, 'plain', { label: 'Undo', run: () => void api().entries.restore([detail.id]) })
  }

  const moreItems = detail.trashedAt
    ? [
        { label: 'Restore', onSelect: () => void api().entries.restore([detail.id]) },
        {
          label: 'Delete permanently',
          danger: true,
          onSelect: () =>
            confirm({
              title: `Delete “${detail.title}” for good?`,
              body: 'This cannot be undone, on this or any synced device.',
              confirmLabel: 'Delete permanently',
              danger: true,
              onConfirm: () => void api().entries.purge([detail.id]),
            }),
        },
      ]
    : [
        ...(detail.type === 'ssh'
          ? [
              { label: 'Copy ssh command', onSelect: () => void copySshCommand(detail.id) },
              ...(detail.secrets.privateKey ? [{ label: 'Load key into SSH agent', onSelect: () => void addSshKey(detail.id) }] : []),
              { separator: true },
            ]
          : []),
        { label: 'Move to folder', disabled: true },
        { label: 'No folder', checked: detail.folderId === null, onSelect: () => void api().entries.move([detail.id], null) },
        ...folders.map((folder) => ({
          label: folder.name,
          checked: detail.folderId === folder.id,
          onSelect: () => void api().entries.move([detail.id], folder.id),
        })),
        { separator: true },
        { label: 'Move to Trash', danger: true, onSelect: () => void trash() },
      ]

  const visibleFields = FIELD_DEFS[detail.type].filter((def) => {
    if (def.when && !def.when(detail.fields, detail.secrets)) return false
    if (def.secret) return detail.secrets[def.key]
    return Boolean(detail.fields[def.key])
  })

  return (
    <article className="page" data-type={detail.type}>
      <div className="page-bar drag">
        <nav className="page-path">
          <button type="button" className="page-crumb" onClick={() => onView({ kind: 'type', type: detail.type })}>
            {meta.plural}
          </button>
          {path.map((name, index) => (
            <span key={index} className="page-crumb-static">
              <span className="page-sep">/</span>
              {name}
            </span>
          ))}
        </nav>
        <div className="page-bar-actions">
          <button
            type="button"
            className={`btn btn-quiet btn-icon btn-sm${detail.favorite ? ' is-on' : ''}`}
            aria-label={detail.favorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={detail.favorite}
            onClick={() => void api().entries.setFavorite(detail.id, !detail.favorite)}
          >
            <Star />
          </button>
          <button type="button" ref={moreRef} className="btn btn-quiet btn-icon btn-sm" aria-label="More actions" onClick={() => openUnder(moreRef.current, moreItems, 'end')}>
            <Ellipsis />
          </button>
        </div>
      </div>

      <div className="page-scroll">
        <div className="band">
          <span className="band-mark caps">{meta.mark}</span>
          <span className="band-serial mono">
            REV {detail.history.length + 1} · {shortDate(detail.updatedAt)}
          </span>
        </div>

        <header className="page-head">
          <div className="page-heading">
            <h1 className="selectable">{detail.title}</h1>
            {detail.type === 'ssh' ? (
              <p className="page-sub mono selectable">
                {detail.fields.username ? `${detail.fields.username}@` : ''}
                {detail.fields.host}
                {detail.fields.port && detail.fields.port !== '22' ? `:${detail.fields.port}` : ''}
              </p>
            ) : null}
            {detail.card ? (
              <p className="page-sub mono selectable">
                {detail.card.brand} ···· {detail.card.last4}
              </p>
            ) : null}
          </div>
          {detail.trashedAt ? (
            <div className="page-actions">
              <button type="button" className="btn btn-primary" onClick={() => void api().entries.restore([detail.id])}>
                Restore
              </button>
            </div>
          ) : (
            <div className="page-actions">
              <button type="button" className="btn btn-primary" onClick={runPrimaryAction}>
                {primary.kind === 'connect' ? <Terminal /> : null}
                {primary.label}
              </button>
              <button type="button" className="btn" onClick={onEdit}>
                Edit
              </button>
            </div>
          )}
        </header>

        {detail.trashedAt ? (
          <p className="page-flag">
            <span className="flag-word">IN TRASH</span> Deleted {relativeTime(detail.trashedAt)}. It stays here until you empty the Trash.
          </p>
        ) : null}
        {detail.health.weak ? (
          <p className="page-flag">
            <span className="flag-word">WEAK</span> This password is guessable. Replace it with a generated one.
          </p>
        ) : null}
        {detail.health.reused ? (
          <p className="page-flag">
            <span className="flag-word">REUSED</span> Another entry in this vault uses the same password.
          </p>
        ) : null}
        {detail.health.expired ? (
          <p className="page-flag">
            <span className="flag-word">EXPIRED</span> This stopped being valid. Rotate it and update the date.
          </p>
        ) : null}
        {detail.health.expiring && !detail.health.expired ? (
          <p className="page-flag is-caution">
            <span className="flag-word">EXPIRES</span> Coming up soon — rotate it before it stops working.
          </p>
        ) : null}

        <dl className="fields">
          {visibleFields.map((def) => (
            <PaneField
              key={def.key}
              def={def}
              detail={detail}
              revealed={revealed[def.key]}
              onReveal={() => void reveal(def.key)}
              onHide={() => hide(def.key)}
              onCopy={() => void copyField(detail.id, def.key)}
              onLarge={() => void showLarge(def.key, def.label)}
            />
          ))}

          {detail.strength !== null && detail.secrets.password ? (
            <FieldRow label="Strength">
              <span className="strength-line">
                <span className="strength-meter" data-score={detail.strength} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((step) => (
                    <span key={step} data-on={step <= (detail.strength ?? -1)} />
                  ))}
                </span>
                <span className="strength-words">{STRENGTH_WORDS[detail.strength]}</span>
              </span>
            </FieldRow>
          ) : null}

          {detail.custom.map((field) => {
            const ref = `custom:${field.id}`
            const value = field.secret ? revealed[ref] : field.value
            return (
              <FieldRow
                key={field.id}
                label={field.label}
                actions={
                  <>
                    {field.secret ? (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => (revealed[ref] === undefined ? void reveal(ref) : hide(ref))}>
                        {revealed[ref] === undefined ? 'Show' : 'Hide'}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copyField(detail.id, ref)}>
                      Copy
                    </button>
                  </>
                }
              >
                {value === undefined ? <SealedBand /> : <span className="field-plain mono selectable">{value}</span>}
              </FieldRow>
            )
          })}
        </dl>

        {detail.type !== 'note' && detail.notes ? (
          <section className="page-section">
            <h2 className="caps">Notes</h2>
            <p className="notes selectable">{detail.notes}</p>
          </section>
        ) : null}

        {detail.tags.length ? (
          <section className="page-section">
            <h2 className="caps">Tags</h2>
            <div className="tags">
              {detail.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {detail.history.length ? (
          <section className="page-section">
            <h2 className="caps">
              Revisions · {detail.history.length} kept
            </h2>
            <div className="history">
              {detail.history.map((version) => (
                <Fragment key={version.index}>
                  <div className={`history-row${compare === version.index ? ' is-open' : ''}`}>
                    <span className="history-when mono">
                      <span className="history-rev">REV {version.index + 1}</span>
                      <span>{shortDate(version.updatedAt)}</span>
                    </span>
                    <span className="history-what">{version.changed.length ? `Changed ${version.changed.join(', ')}` : 'No visible change'}</span>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-expanded={compare === version.index}
                      onClick={() => setCompare(compare === version.index ? null : version.index)}
                    >
                      {compare === version.index ? 'Hide' : 'Compare'}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void api().entries.restoreVersion(detail.id, version.index)}>
                      Restore
                    </button>
                  </div>
                  {compare === version.index ? <RevisionCompare detail={detail} version={version} /> : null}
                </Fragment>
              ))}
            </div>
          </section>
        ) : null}

        {detail.type === 'ssh' && detail.command ? <MrzStrip command={detail.command} onCopy={() => void copySshCommand(detail.id)} /> : null}

        <p className="page-foot">
          Created {shortDate(detail.createdAt)} · changed {relativeTime(detail.updatedAt)} · <Keycap>{mod}E</Keycap> to edit
        </p>
      </div>

      {large ? <LargeType label={large.label} value={large.value} onClose={() => setLarge(null)} /> : null}
      {menu}
    </article>
  )
}

function PaneField({
  def,
  detail,
  revealed,
  onReveal,
  onHide,
  onCopy,
  onLarge,
}: {
  def: FieldDef
  detail: EntryDetail
  revealed: string | undefined
  onReveal: () => void
  onHide: () => void
  onCopy: () => void
  onLarge: () => void
}) {
  const value = detail.fields[def.key] ?? ''

  if (def.key === 'auth' && detail.type === 'ssh') {
    return <FieldRow label={def.label}>{AUTH_LABEL[sshAuth(detail.fields, detail.secrets)] ?? 'Private key from this vault'}</FieldRow>
  }

  if (def.kind === 'totp') {
    return (
      <FieldRow
        label={def.label}
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCopy}>
            Copy
          </button>
        }
      >
        <TotpCells entryId={detail.id} />
      </FieldRow>
    )
  }

  if (!def.secret) {
    const content =
      def.kind === 'url' ? (
        <button type="button" className="field-link mono" onClick={() => void openUrl(value)}>
          {value} <ExternalLink />
        </button>
      ) : def.cells ? (
        <DigitCells value={def.kind === 'expiry' ? value.replace(/\D/g, '') : value} group={def.kind === 'expiry' ? 2 : undefined} />
      ) : def.kind === 'multiline' ? (
        <p className="field-multiline selectable">{value}</p>
      ) : (
        <span className={`field-plain selectable${def.kind === 'mono' ? ' mono' : ''}`}>{value}</span>
      )
    return (
      <FieldRow
        label={def.label}
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCopy}>
            Copy
          </button>
        }
      >
        {content}
      </FieldRow>
    )
  }

  const isRevealed = revealed !== undefined
  const body = !isRevealed ? (
    <span className="sealed-row">
      <SealedBand />
      {def.key === 'number' && detail.card ? (
        <span className="field-hint mono">
          {detail.card.brand} ···· {detail.card.last4}
        </span>
      ) : null}
    </span>
  ) : def.kind === 'multiline' ? (
    <pre className="field-key mono selectable">{revealed}</pre>
  ) : def.kind === 'cardNumber' ? (
    <DigitCells value={revealed.replace(/\D/g, '')} group={4} />
  ) : (
    <span className="field-secret mono selectable">{revealed}</span>
  )

  return (
    <FieldRow
      label={def.label}
      actions={
        <>
          <button type="button" className="btn btn-quiet btn-sm" onClick={isRevealed ? onHide : onReveal}>
            {isRevealed ? 'Hide' : 'Show'}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCopy}>
            Copy
          </button>
          {def.kind !== 'multiline' ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onLarge} title="Show in large type for typing elsewhere">
              Large
            </button>
          ) : null}
        </>
      }
    >
      {body}
    </FieldRow>
  )
}

/** One past revision, printed in the same register as the current values. */
function RevisionCompare({ detail, version }: { detail: EntryDetail; version: HistoryView }) {
  const labelFor = (key: string) => {
    if (key === 'title') return 'Title'
    if (key === 'notes') return 'Notes'
    if (key === 'tags') return 'Tags'
    if (key === 'custom fields') return 'Custom fields'
    return FIELD_DEFS[detail.type].find((def) => def.key === key)?.label ?? key
  }

  return (
    <div className="history-compare">
      <dl className="fields">
        {version.changed.map((key) => {
          if (key === 'title') {
            return (
              <FieldRow key={key} label="Title">
                <span className="field-plain">{version.title}</span>
              </FieldRow>
            )
          }
          if (key === 'notes') {
            return (
              <FieldRow key={key} label="Notes">
                <p className="field-multiline">{version.notes || '—'}</p>
              </FieldRow>
            )
          }
          if (key === 'tags') {
            return (
              <FieldRow key={key} label="Tags">
                <span className="field-plain">{version.tags.join(', ') || '—'}</span>
              </FieldRow>
            )
          }
          if (key in version.secrets) {
            return (
              <FieldRow key={key} label={labelFor(key)}>
                <span className="sealed-row">
                  <SealedBand label="Sealed in this revision" />
                  <span className="field-hint">{version.secrets[key] ? 'held a value' : 'was empty'}</span>
                </span>
              </FieldRow>
            )
          }
          return (
            <FieldRow key={key} label={labelFor(key)}>
              <span className="field-plain mono">{version.fields[key] || '—'}</span>
            </FieldRow>
          )
        })}
      </dl>
      <p className="history-compare-note">
        REV {version.index + 1}, in the same places as the current values. Past sealed values are never shown — restore the revision to use them.
      </p>
    </div>
  )
}

// --------------------------------------------------------------- empty pane

export function PaneEmpty({
  app,
  entries,
  folders,
  view,
  query,
  onNew,
  onPanel,
}: {
  app: AppState
  entries: EntrySummary[]
  folders: FolderView[]
  view: View
  query: string
  onNew: (type: EntryType) => void
  onPanel: (panel: Panel) => void
}) {
  const vault = app.vault
  const sync = useStore((s) => s.app?.sync)
  const mod = modKey(app.platform)
  const fresh = entries.length === 0 && !query && view.kind === 'all'

  if (!vault) return <article className="page" />

  return (
    <article className="page">
      <div className="page-bar drag" />
      <div className="page-scroll page-empty">
        <Rosette id={vault.vaultId} size={132} />
        <h1 className="empty-title">{fresh ? `“${vault.name}” is sealed and ready.` : vault.name}</h1>
        <p className="empty-meta mono">
          {vaultCode(vault.vaultId)} · {locationLabel(vault.path)}
        </p>

        {fresh ? (
          <>
            <p className="empty-body">
              Encrypted with your master password in {locationLabel(vault.path)} — open the same file on another computer and this fingerprint matches.
            </p>
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => onNew('login')}>
                Add a login
              </button>
              <button type="button" className="btn" onClick={() => onNew('ssh')}>
                Add an SSH host
              </button>
              <button type="button" className="btn" onClick={() => onPanel('import')}>
                Import from KeePass…
              </button>
            </div>
            <div className="empty-offer">
              <BiometricOffer app={app} />
            </div>
          </>
        ) : (
          <>
            <p className="empty-body">
              {entries.filter((entry) => !entry.trashedAt).length} entries · {folders.length} folders ·{' '}
              {sync?.at ? `saved ${relativeTime(sync.at)}` : 'saved'}
            </p>
            <ul className="empty-keys">
              <li>
                <Keycap>{mod}K</Keycap> search this vault
              </li>
              <li>
                <Keycap>{mod}N</Keycap> new entry
              </li>
              <li>
                <Keycap>{mod}L</Keycap> lock
              </li>
              <li>
                <Keycap>{app.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space'}</Keycap> quick search from any app
              </li>
            </ul>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onPanel('security')}>
              <KeyRound /> What protects this vault
            </button>
          </>
        )}
      </div>
    </article>
  )
}
