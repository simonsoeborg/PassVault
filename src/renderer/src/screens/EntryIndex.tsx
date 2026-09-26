import { ArrowUpDown, Plus, Search, Star } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import type { AppState, EntrySummary, EntryType, FolderView } from '../../../shared/types'
import { Keycap, useMenu, type ConfirmRequest } from '../components/ui'
import { copyField, runPrimary } from '../lib/actions'
import { TYPE_META, TYPE_ORDER } from '../lib/entryTypes'
import { modKey } from '../lib/format'
import { unhealthy, viewTitle, type View } from '../lib/views'
import { api, notify } from '../store'

interface EntryIndexProps {
  app: AppState
  list: EntrySummary[]
  folders: FolderView[]
  view: View
  query: string
  sort: 'title' | 'updated'
  searchRef: RefObject<HTMLInputElement | null>
  selectedId: string | null
  editing: boolean
  onQuery: (query: string) => void
  onSort: (sort: 'title' | 'updated') => void
  onSelect: (id: string) => void
  onPrimary: (entry: EntrySummary) => void
  onNew: (type: EntryType) => void
  confirm: (request: ConfirmRequest) => void
}

export function EntryIndex({
  app,
  list,
  folders,
  view,
  query,
  sort,
  searchRef,
  selectedId,
  editing,
  onQuery,
  onSort,
  onSelect,
  onPrimary,
  onNew,
  confirm,
}: EntryIndexProps) {
  const rowsRef = useRef<HTMLDivElement>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  const { menu, openAt, openUnder } = useMenu()
  const mod = modKey(app.platform)

  useEffect(() => {
    if (!selectedId) return
    rowsRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const move = (delta: number) => {
    if (!list.length) return
    const current = list.findIndex((entry) => entry.id === selectedId)
    const next = Math.min(list.length - 1, Math.max(0, (current === -1 ? 0 : current) + delta))
    onSelect(list[next].id)
  }

  const onRowsKeyDown = (event: React.KeyboardEvent) => {
    const entry = list.find((item) => item.id === selectedId)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter' && entry) {
      event.preventDefault()
      onPrimary(entry)
    } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c' && entry) {
      event.preventDefault()
      void copyField(entry.id, 'username')
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && entry) {
      event.preventDefault()
      void trashEntry(entry)
    }
  }

  const trashEntry = async (entry: EntrySummary) => {
    if (entry.trashedAt) return
    const result = await api().entries.trash([entry.id])
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    notify(`Moved “${entry.title}” to Trash`, 'plain', {
      label: 'Undo',
      run: () => void api().entries.restore([entry.id]),
    })
  }

  const rowMenu = (event: React.MouseEvent, entry: EntrySummary) => {
    const folderItems = [
      { label: 'No folder', checked: entry.folderId === null, onSelect: () => void api().entries.move([entry.id], null) },
      ...folders.map((folder) => ({
        label: folder.name,
        checked: entry.folderId === folder.id,
        onSelect: () => void api().entries.move([entry.id], folder.id),
      })),
    ]
    openAt(
      event,
      entry.trashedAt
        ? [
            { label: 'Restore', onSelect: () => void api().entries.restore([entry.id]) },
            { separator: true },
            {
              label: 'Delete permanently',
              danger: true,
              onSelect: () =>
                confirm({
                  title: `Delete “${entry.title}” for good?`,
                  body: 'This cannot be undone, on this or any synced device.',
                  confirmLabel: 'Delete permanently',
                  danger: true,
                  onConfirm: () => void api().entries.purge([entry.id]),
                }),
            },
          ]
        : [
            entry.type === 'ssh'
              ? { label: 'Connect', hint: '↵', onSelect: () => void runPrimary(entry) }
              : { label: 'Copy password', hint: '↵', onSelect: () => void runPrimary(entry) },
            { label: 'Copy username', hint: `${mod}⇧C`, onSelect: () => void copyField(entry.id, 'username') },
            ...(entry.hasTotp ? [{ label: 'Copy one-time code', onSelect: () => void copyField(entry.id, 'totp') }] : []),
            { separator: true },
            {
              label: entry.favorite ? 'Remove from favourites' : 'Add to favourites',
              onSelect: () => void api().entries.setFavorite(entry.id, !entry.favorite),
            },
            ...folderItems.slice(0, 1),
            ...(folders.length ? [{ separator: true }, ...folderItems.slice(1)] : []),
            { separator: true },
            { label: 'Move to Trash', danger: true, onSelect: () => void trashEntry(entry) },
          ],
    )
  }

  const title = query.trim() ? `Results for “${query.trim()}”` : viewTitle(view, folders)

  return (
    <section className="index">
      <div className="index-bar drag">
        <label className="search no-drag">
          <Search />
          <input
            ref={searchRef}
            className="search-input"
            type="search"
            placeholder="Search vault"
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                rowsRef.current?.focus()
                move(selectedId ? 1 : 0)
              }
              if (event.key === 'Enter') {
                const entry = list.find((item) => item.id === selectedId) ?? list[0]
                if (entry) {
                  event.preventDefault()
                  onSelect(entry.id)
                  onPrimary(entry)
                }
              }
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                onQuery('')
              }
            }}
          />
          {query ? null : <Keycap>{mod}K</Keycap>}
        </label>
      </div>

      <header className="index-head">
        <h2 className="index-title">{title}</h2>
        <span className="index-count mono">{list.length}</span>
        <span className="index-spacer" />
        {view.kind === 'trash' && list.length ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() =>
              confirm({
                title: 'Empty the Trash?',
                body: `${list.length} ${list.length === 1 ? 'entry is' : 'entries are'} erased for good, on every device that syncs this vault.`,
                confirmLabel: 'Empty Trash',
                danger: true,
                onConfirm: () => void api().entries.purge(list.map((entry) => entry.id)),
              })
            }
          >
            Empty Trash
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-label={`Sort by ${sort === 'title' ? 'last changed' : 'name'}`}
              onClick={() => onSort(sort === 'title' ? 'updated' : 'title')}
            >
              <ArrowUpDown /> {sort === 'title' ? 'A–Z' : 'Recent'}
            </button>
            <button
              type="button"
              ref={newRef}
              className="btn btn-sm index-new"
              onClick={() => openUnder(newRef.current, TYPE_ORDER.map((type) => ({ label: TYPE_META[type].newLabel, onSelect: () => onNew(type) })), 'end')}
            >
              <Plus /> New
            </button>
          </>
        )}
      </header>

      <div
        className="index-rows"
        ref={rowsRef}
        role="listbox"
        aria-label={title}
        tabIndex={0}
        aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
        onKeyDown={onRowsKeyDown}
      >
        {list.map((entry) => (
          <div
            key={entry.id}
            id={`row-${entry.id}`}
            data-id={entry.id}
            data-type={entry.type}
            role="option"
            aria-selected={entry.id === selectedId && !editing}
            className={`row${entry.id === selectedId ? ' is-selected' : ''}${entry.trashedAt ? ' is-trashed' : ''}`}
            onClick={() => onSelect(entry.id)}
            onDoubleClick={() => onPrimary(entry)}
            onContextMenu={(event) => rowMenu(event, entry)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-passvault-entries', JSON.stringify([entry.id]))
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <span className="row-mark">{TYPE_META[entry.type].mark}</span>
            <span className="row-title">{entry.title}</span>
            <span className="row-sub mono">{entry.subtitle}</span>
            <span className="row-flags">
              {entry.hasTotp ? <span className="row-flag mono" title="Has a one-time code">2FA</span> : null}
              {unhealthy(entry) ? (
                <span
                  className="row-alert"
                  title={
                    entry.health.weak
                      ? 'Weak password'
                      : entry.health.reused
                        ? 'Password reused'
                        : entry.health.expired
                          ? 'Expired'
                          : 'Expires soon'
                  }
                />
              ) : null}
              {entry.favorite ? <Star className="row-star" /> : null}
            </span>
          </div>
        ))}

        {list.length === 0 ? <IndexEmpty view={view} query={query} onNew={onNew} /> : null}
      </div>
      {menu}
    </section>
  )
}

function IndexEmpty({ view, query, onNew }: { view: View; query: string; onNew: (type: EntryType) => void }) {
  if (query.trim()) {
    return (
      <div className="index-empty">
        <p className="index-empty-title">Nothing matches “{query.trim()}”.</p>
        <p>Search covers titles, usernames, hosts, URLs, tags and custom field names — never the sealed values.</p>
        <button type="button" className="btn btn-sm" onClick={() => onNew('login')}>
          <Plus /> New login
        </button>
      </div>
    )
  }
  switch (view.kind) {
    case 'favorites':
      return (
        <div className="index-empty">
          <p className="index-empty-title">No favourites yet.</p>
          <p>Star the entries you reach for daily and they collect here, at the top of quick search too.</p>
        </div>
      )
    case 'trash':
      return (
        <div className="index-empty">
          <p className="index-empty-title">The Trash is empty.</p>
          <p>Deleted entries wait here until you empty it, so a mistaken delete is never final.</p>
        </div>
      )
    case 'health':
      return (
        <div className="index-empty">
          <p className="index-empty-title">Nothing to fix.</p>
          <p>No weak or reused passwords, and nothing expiring in the next month.</p>
        </div>
      )
    case 'folder':
      return (
        <div className="index-empty">
          <p className="index-empty-title">This folder is empty.</p>
          <p>Drag entries onto it in the rail, or create one here.</p>
          <button type="button" className="btn btn-sm" onClick={() => onNew('login')}>
            <Plus /> New entry
          </button>
        </div>
      )
    case 'type':
      return (
        <div className="index-empty">
          <p className="index-empty-title">No {TYPE_META[view.type].plural.toLowerCase()} yet.</p>
          <button type="button" className="btn btn-sm" onClick={() => onNew(view.type)}>
            <Plus /> New {TYPE_META[view.type].newLabel.toLowerCase()}
          </button>
        </div>
      )
    default:
      return (
        <div className="index-empty">
          <p className="index-empty-title">This vault is empty.</p>
          <p>Entries you add will be listed here.</p>
        </div>
      )
  }
}
