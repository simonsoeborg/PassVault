import { Dices, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EntryDetail, EntryInput, EntryType, FolderView } from '../../../shared/types'
import { GeneratorPanel } from '../components/Generator'
import { Segmented } from '../components/ui'
import { FIELD_DEFS, TYPE_META, TYPE_ORDER, sshAuth, type FieldDef } from '../lib/entryTypes'
import { api, notify } from '../store'

interface CustomDraft {
  id?: string
  label: string
  secret: boolean
  /** undefined means "unchanged", so a stored secret is never sent back through the bridge. */
  value?: string
  present: boolean
}

interface EditorProps {
  mode: 'new' | 'edit'
  type?: EntryType
  entryId?: string
  folders: FolderView[]
  defaultFolderId?: string | null
  onDone: (id?: string) => void
  onCancel: () => void
}

export function EntryEditor({ mode, type: initialType, entryId, folders, defaultFolderId, onDone, onCancel }: EditorProps) {
  const [type, setType] = useState<EntryType>(initialType ?? 'login')
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId ?? null)
  const [fields, setFields] = useState<Record<string, string>>((): Record<string, string> => (initialType === 'ssh' ? { auth: 'key' } : {}))
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState<CustomDraft[]>([])
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [generatorFor, setGeneratorFor] = useState<{ key: string; anchor: HTMLElement } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'new') {
      titleRef.current?.focus()
      return
    }
    if (!entryId) return
    let live = true
    void api()
      .entries.get(entryId)
      .then((result) => {
        if (!live) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        const value = result.value
        setDetail(value)
        setType(value.type)
        setTitle(value.title)
        setFolderId(value.folderId)
        setFields({ ...value.fields })
        setNotes(value.type === 'note' ? '' : value.notes)
        setTags(value.tags.join(', '))
        setCustom(value.custom.map((field) => ({ id: field.id, label: field.label, secret: field.secret, value: field.secret ? undefined : (field.value ?? ''), present: field.present })))
      })
    return () => {
      live = false
    }
  }, [entryId, mode])

  const secretPresent = (key: string) => Boolean(detail?.secrets[key])
  const definitions = FIELD_DEFS[type]

  const save = async () => {
    setBusy(true)
    setError(null)
    const input: EntryInput = {
      type,
      title,
      folderId,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      favorite: detail?.favorite,
      fields: { ...fields, ...secrets },
      custom: custom
        .filter((field) => field.label.trim() || field.value)
        .map((field) => ({ id: field.id, label: field.label.trim() || 'Field', secret: field.secret, value: field.value })),
      notes,
    }
    const result = mode === 'new' ? await api().entries.create(input) : await api().entries.update(entryId!, input)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    notify(mode === 'new' ? `Added “${title.trim() || 'Untitled'}”` : 'Saved')
    onDone(mode === 'new' ? (result.value as string) : entryId)
  }

  const revealForEditing = async (key: string) => {
    if (!entryId) return
    const result = await api().entries.reveal(entryId, key)
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    setSecrets((current) => ({ ...current, [key]: result.value }))
    setShown((current) => ({ ...current, [key]: true }))
  }

  const revealCustom = async (index: number) => {
    const field = custom[index]
    if (!entryId || !field.id) return
    const result = await api().entries.reveal(entryId, `custom:${field.id}`)
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    setCustom((current) => current.map((item, i) => (i === index ? { ...item, value: result.value } : item)))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!busy) void save()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <article className="page is-editing" data-type={type} onKeyDown={onKeyDown}>
      <div className="page-bar drag">
        <div className="page-bar-fields no-drag">
          {mode === 'new' ? (
            <label className="bar-field">
              <span className="caps">Type</span>
              <select className="input input-inline" value={type} onChange={(event) => setType(event.target.value as EntryType)}>
                {TYPE_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {TYPE_META[option].label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="bar-field">
            <span className="caps">Folder</span>
            <select className="input input-inline" value={folderId ?? ''} onChange={(event) => setFolderId(event.target.value || null)}>
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="page-scroll">
        <div className="band">
          <span className="band-mark caps">{TYPE_META[type].mark}</span>
          <span className="band-serial mono">{mode === 'new' ? 'NEW ENTRY' : `EDITING REV ${(detail?.history.length ?? 0) + 1}`}</span>
        </div>

        <header className="page-head">
          <input
            ref={titleRef}
            className="title-input"
            value={title}
            placeholder={type === 'ssh' ? 'db-primary' : type === 'note' ? 'Recovery codes' : 'GitHub'}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </header>

        <dl className="fields is-editing">
          {definitions.map((def) => (
            <EditorField
              key={def.key}
              def={def}
              type={type}
              fields={fields}
              secrets={secrets}
              present={secretPresent(def.key)}
              shown={Boolean(shown[def.key])}
              canReveal={mode === 'edit'}
              onPlain={(value) => setFields((current) => ({ ...current, [def.key]: value }))}
              onSecret={(value) => setSecrets((current) => ({ ...current, [def.key]: value }))}
              onToggleShown={() => setShown((current) => ({ ...current, [def.key]: !current[def.key] }))}
              onReveal={() => void revealForEditing(def.key)}
              onGenerate={(anchor) => setGeneratorFor({ key: def.key, anchor })}
            />
          ))}

          {custom.map((field, index) => (
            <div className="field is-custom" key={field.id ?? `draft-${index}`}>
              <dt className="field-label">
                <input
                  className="input input-inline"
                  value={field.label}
                  placeholder="Field name"
                  onChange={(event) => setCustom((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                />
              </dt>
              <dd className="field-value">
                {field.secret && field.value === undefined && field.present ? (
                  <button type="button" className="btn btn-sm" onClick={() => void revealCustom(index)}>
                    Change
                  </button>
                ) : (
                  <input
                    className="input mono"
                    type={field.secret ? 'text' : 'text'}
                    value={field.value ?? ''}
                    onChange={(event) => setCustom((current) => current.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))}
                  />
                )}
              </dd>
              <div className="field-actions">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={field.secret}
                    onChange={(event) => setCustom((current) => current.map((item, i) => (i === index ? { ...item, secret: event.target.checked } : item)))}
                  />
                  <span>Seal</span>
                </label>
                <button
                  type="button"
                  className="btn btn-quiet btn-icon btn-sm"
                  aria-label="Remove field"
                  onClick={() => setCustom((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          ))}
        </dl>

        <button type="button" className="btn btn-quiet btn-sm add-field" onClick={() => setCustom((current) => [...current, { label: '', secret: false, value: '', present: false }])}>
          <Plus /> Add a field
        </button>

        {type === 'note' ? null : (
          <section className="page-section">
            <h2 className="caps">Notes</h2>
            <textarea className="input" value={notes} rows={4} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else worth keeping with this entry." />
          </section>
        )}

        <section className="page-section">
          <h2 className="caps">Tags</h2>
          <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="prod, client-work" />
        </section>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="editor-foot">
        <span className="editor-hint">Secrets you don’t touch stay as they are.</span>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} aria-busy={busy} disabled={busy}>
          {mode === 'new' ? 'Add entry' : 'Save'}
        </button>
      </footer>

      {generatorFor ? (
        <GeneratorPanel
          anchor={generatorFor.anchor}
          onUse={(value) => {
            setSecrets((current) => ({ ...current, [generatorFor.key]: value }))
            setShown((current) => ({ ...current, [generatorFor.key]: true }))
          }}
          onClose={() => setGeneratorFor(null)}
        />
      ) : null}
    </article>
  )
}

function EditorField({
  def,
  type,
  fields,
  secrets,
  present,
  shown,
  canReveal,
  onPlain,
  onSecret,
  onToggleShown,
  onReveal,
  onGenerate,
}: {
  def: FieldDef
  type: EntryType
  fields: Record<string, string>
  secrets: Record<string, string>
  present: boolean
  shown: boolean
  canReveal: boolean
  onPlain: (value: string) => void
  onSecret: (value: string) => void
  onToggleShown: () => void
  onReveal: () => void
  onGenerate: (anchor: HTMLElement) => void
}) {
  const generateRef = useRef<HTMLButtonElement>(null)
  const secretsPresence = Object.fromEntries(Object.keys(secrets).map((key) => [key, true]))
  if (def.when && !def.when(fields, { ...secretsPresence, ...(present ? { [def.key]: true } : {}) })) return null

  if (def.kind === 'segmented' && def.options) {
    const current = def.key === 'auth' && type === 'ssh' ? sshAuth(fields, secretsPresence) : (fields[def.key] ?? def.options[0].value)
    return (
      <div className="field">
        <dt className="field-label caps">{def.label}</dt>
        <dd className="field-value">
          <Segmented label={def.label} value={current} options={def.options} onChange={onPlain} />
        </dd>
      </div>
    )
  }

  if (def.kind === 'select' && def.options) {
    return (
      <div className="field">
        <dt className="field-label caps">{def.label}</dt>
        <dd className="field-value">
          <select className="input" value={fields[def.key] ?? ''} onChange={(event) => onPlain(event.target.value)}>
            {def.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </dd>
      </div>
    )
  }

  if (!def.secret) {
    return (
      <div className="field">
        <dt className="field-label caps">{def.label}</dt>
        <dd className="field-value">
          {def.kind === 'multiline' ? (
            <textarea className="input" rows={3} value={fields[def.key] ?? ''} placeholder={def.placeholder} onChange={(event) => onPlain(event.target.value)} />
          ) : (
            <input
              className={`input${def.kind === 'mono' ? ' mono' : ''}`}
              type={def.kind === 'date' ? 'date' : def.kind === 'email' ? 'email' : def.kind === 'tel' ? 'tel' : 'text'}
              inputMode={def.kind === 'port' ? 'numeric' : undefined}
              value={fields[def.key] ?? ''}
              placeholder={def.placeholder}
              onChange={(event) => onPlain(event.target.value)}
            />
          )}
        </dd>
      </div>
    )
  }

  const draft = secrets[def.key]
  const unchanged = draft === undefined && present

  return (
    <div className="field">
      <dt className="field-label caps">{def.label}</dt>
      <dd className="field-value">
        {unchanged ? (
          <span className="sealed-row">
            <span className="sealed" role="img" aria-label="Sealed" />
            <span className="field-hint">kept as it is</span>
          </span>
        ) : def.kind === 'multiline' ? (
          <textarea
            className="input mono"
            rows={5}
            value={draft ?? ''}
            placeholder={def.placeholder}
            spellCheck={false}
            onChange={(event) => onSecret(event.target.value)}
          />
        ) : (
          <div className="input-wrap">
            <input
              className="input mono"
              type={shown ? 'text' : 'password'}
              value={draft ?? ''}
              placeholder={def.placeholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onSecret(event.target.value)}
            />
            <button type="button" className="btn btn-quiet btn-icon btn-sm input-adorn" aria-label={shown ? 'Hide' : 'Show'} onClick={onToggleShown}>
              {shown ? <EyeOff /> : <Eye />}
            </button>
          </div>
        )}
      </dd>
      <div className="field-actions">
        {unchanged ? (
          <button type="button" className="btn btn-sm" onClick={canReveal ? onReveal : () => onSecret('')}>
            Change
          </button>
        ) : null}
        {def.generator && !unchanged ? (
          <button type="button" ref={generateRef} className="btn btn-quiet btn-sm" onClick={() => generateRef.current && onGenerate(generateRef.current)}>
            <Dices /> Generate
          </button>
        ) : null}
      </div>
    </div>
  )
}
