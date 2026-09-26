import { ChevronRight, FolderPlus, Lock } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { AppState, EntrySummary, FolderView } from '../../../shared/types'
import { Rosette } from '../components/Rosette'
import { Keycap, useMenu, type ConfirmRequest } from '../components/ui'
import { TYPE_META, TYPE_ORDER } from '../lib/entryTypes'
import { clockTime, locationLabel, modKey } from '../lib/format'
import { vaultCode } from '../lib/rosette'
import { unhealthy, type View } from '../lib/views'
import { api, notify, useStore } from '../store'
import type { Panel } from './VaultWindow'

const EXPANDED_KEY = 'passvault.expandedFolders'

interface RailProps {
  app: AppState
  entries: EntrySummary[]
  folders: FolderView[]
  view: View
  panel: Panel
  onView: (view: View) => void
  onPanel: (panel: Panel) => void
  confirm: (request: ConfirmRequest) => void
}

export function Rail({ app, entries, folders, view, panel, onView, onPanel, confirm }: RailProps) {
  const sync = useStore((s) => s.app?.sync)
  const vault = app.vault
  const identityRef = useRef<HTMLButtonElement>(null)
  const { menu, openUnder, openAt } = useMenu()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })

  const counts = useMemo(() => {
    const live = entries.filter((entry) => !entry.trashedAt)
    const byFolder = new Map<string, number>()
    for (const entry of live) {
      if (entry.folderId) byFolder.set(entry.folderId, (byFolder.get(entry.folderId) ?? 0) + 1)
    }
    return {
      all: live.length,
      favorites: live.filter((entry) => entry.favorite).length,
      health: live.filter(unhealthy).length,
      trash: entries.length - live.length,
      byType: Object.fromEntries(TYPE_ORDER.map((type) => [type, live.filter((entry) => entry.type === type).length])),
      byFolder,
    }
  }, [entries])

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const childrenOf = (parentId: string | null) => folders.filter((folder) => folder.parentId === parentId)

  const createFolder = async (parentId: string | null) => {
    const result = await api().folders.create({ name: 'New folder', parentId })
    if (!result.ok) {
      notify(result.error.message, 'alert')
      return
    }
    if (parentId) setExpanded((current) => new Set(current).add(parentId))
    setRenaming(result.value)
    onView({ kind: 'folder', id: result.value })
  }

  const removeFolder = (folder: FolderView) => {
    const descendants = new Set<string>([folder.id])
    let grew = true
    while (grew) {
      grew = false
      for (const candidate of folders) {
        if (candidate.parentId && descendants.has(candidate.parentId) && !descendants.has(candidate.id)) {
          descendants.add(candidate.id)
          grew = true
        }
      }
    }
    const affected = entries.filter((entry) => entry.folderId && descendants.has(entry.folderId) && !entry.trashedAt).length
    confirm({
      title: `Delete “${folder.name}”?`,
      body:
        affected > 0
          ? `${affected} ${affected === 1 ? 'entry moves' : 'entries move'} to Trash${descendants.size > 1 ? `, along with ${descendants.size - 1} subfolder${descendants.size === 2 ? '' : 's'}` : ''}. Nothing is erased until you empty the Trash.`
          : 'The folder is empty, so nothing else changes.',
      confirmLabel: 'Delete folder',
      danger: true,
      onConfirm: async () => {
        const result = await api().folders.remove(folder.id)
        if (!result.ok) notify(result.error.message, 'alert')
        else if (view.kind === 'folder' && descendants.has(view.id)) onView({ kind: 'all' })
      },
    })
  }

  const drop = async (event: React.DragEvent, folderId: string | null) => {
    event.preventDefault()
    setDropTarget(null)
    const raw = event.dataTransfer.getData('application/x-passvault-entries')
    if (!raw) return
    const ids = JSON.parse(raw) as string[]
    const result = await api().entries.move(ids, folderId)
    if (!result.ok) notify(result.error.message, 'alert')
    else notify(`Moved ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}`)
  }

  const renderFolder = (folder: FolderView, depth: number) => {
    const children = childrenOf(folder.id)
    const isOpen = expanded.has(folder.id)
    const selected = view.kind === 'folder' && view.id === folder.id
    return (
      <li key={folder.id}>
        <div
          className={`rail-row rail-folder${selected ? ' is-current' : ''}${dropTarget === folder.id ? ' is-drop' : ''}`}
          style={{ paddingLeft: 10 + depth * 13 }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-passvault-entries')) return
            event.preventDefault()
            setDropTarget(folder.id)
          }}
          onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
          onDrop={(event) => void drop(event, folder.id)}
        >
          {children.length ? (
            <button
              type="button"
              className="rail-twisty"
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`}
              aria-expanded={isOpen}
              onClick={() => toggleExpanded(folder.id)}
            >
              <ChevronRight />
            </button>
          ) : (
            <span className="rail-twisty is-empty" aria-hidden="true" />
          )}
          {renaming === folder.id ? (
            <input
              className="rail-rename"
              defaultValue={folder.name}
              autoFocus
              onFocus={(event) => event.target.select()}
              onBlur={async (event) => {
                setRenaming(null)
                const name = event.target.value.trim()
                if (name && name !== folder.name) await api().folders.rename(folder.id, name)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  event.currentTarget.value = folder.name
                  event.currentTarget.blur()
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="rail-name"
              onClick={() => onView({ kind: 'folder', id: folder.id })}
              onDoubleClick={() => setRenaming(folder.id)}
              onContextMenu={(event) =>
                openAt(event, [
                  { label: 'New subfolder', onSelect: () => void createFolder(folder.id) },
                  { label: 'Rename', onSelect: () => setRenaming(folder.id) },
                  { separator: true },
                  { label: 'Delete folder', danger: true, onSelect: () => removeFolder(folder) },
                ])
              }
            >
              {folder.name}
            </button>
          )}
          <span className="rail-count">{counts.byFolder.get(folder.id) ?? ''}</span>
        </div>
        {isOpen && children.length ? <ul className="rail-children">{children.map((child) => renderFolder(child, depth + 1))}</ul> : null}
      </li>
    )
  }

  const syncLine = () => {
    if (!sync) return ''
    if (sync.state === 'saving') return 'Saving…'
    if (sync.state === 'error') return sync.detail ?? 'Not saved'
    if (sync.state === 'merged') return `Merged ${sync.at ? clockTime(sync.at) : ''}`.trim()
    const at = sync.at ?? vault?.lastSavedAt ?? null
    return at ? `Saved ${clockTime(at)}` : 'Saved'
  }

  return (
    <nav className="rail">
      <div className="rail-drag drag" />

      <button
        type="button"
        ref={identityRef}
        className="rail-identity"
        onClick={() =>
          openUnder(identityRef.current, [
            { label: 'Vault security', onSelect: () => onPanel('security') },
            { label: 'Settings', hint: `${modKey(app.platform)},`, onSelect: () => onPanel('settings') },
            { label: 'Import from KeePass…', onSelect: () => onPanel('import') },
            { separator: true },
            { label: app.platform === 'darwin' ? 'Show file in Finder' : 'Show file in Explorer', onSelect: () => void api().vault.showInFolder() },
            { separator: true },
            { label: 'Lock vault', hint: `${modKey(app.platform)}L`, onSelect: () => void api().vault.lock() },
          ])
        }
      >
        <Rosette id={vault?.vaultId ?? ''} size={38} />
        <span className="rail-identity-text">
          <span className="rail-vault-name">{vault?.name}</span>
          <span className="rail-vault-code mono">{vault ? vaultCode(vault.vaultId) : ''}</span>
        </span>
      </button>

      <div className="rail-scroll">
        <ul className="rail-list">
          <RailRow label="All items" count={counts.all} current={view.kind === 'all' && !panel} onSelect={() => onView({ kind: 'all' })} onDrop={drop} folderId={null} dropTarget={dropTarget} setDropTarget={setDropTarget} />
          <RailRow label="Favourites" count={counts.favorites} current={view.kind === 'favorites' && !panel} onSelect={() => onView({ kind: 'favorites' })} />
        </ul>

        <p className="rail-label caps">Types</p>
        <ul className="rail-list">
          {TYPE_ORDER.map((type) => (
            <li key={type} data-type={type}>
              <div className={`rail-row${view.kind === 'type' && view.type === type && !panel ? ' is-current' : ''}`}>
                <span className="rail-mark">{TYPE_META[type].mark}</span>
                <button type="button" className="rail-name" onClick={() => onView({ kind: 'type', type })}>
                  {TYPE_META[type].plural}
                </button>
                <span className="rail-count">{counts.byType[type] || ''}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="rail-label caps">
          Folders
          <button type="button" className="btn btn-quiet btn-icon btn-sm rail-add" aria-label="New folder" onClick={() => void createFolder(null)}>
            <FolderPlus />
          </button>
        </p>
        <ul className="rail-list">{childrenOf(null).map((folder) => renderFolder(folder, 0))}</ul>
        {folders.length === 0 ? <p className="rail-empty">No folders yet. Group entries by project, client or machine.</p> : null}

        <p className="rail-label caps">Review</p>
        <ul className="rail-list">
          <li>
            <div className={`rail-row${view.kind === 'health' && !panel ? ' is-current' : ''}`}>
              <button type="button" className="rail-name" onClick={() => onView({ kind: 'health' })}>
                Health
              </button>
              <span className={`rail-count${counts.health ? ' is-alert' : ''}`}>{counts.health || ''}</span>
            </div>
          </li>
          <li>
            <div className={`rail-row${view.kind === 'trash' && !panel ? ' is-current' : ''}`}>
              <button type="button" className="rail-name" onClick={() => onView({ kind: 'trash' })}>
                Trash
              </button>
              <span className="rail-count">{counts.trash || ''}</span>
            </div>
          </li>
        </ul>
      </div>

      <div className="rail-foot">
        <div className={`rail-sync${sync?.state === 'error' ? ' is-alert' : ''}`} title={vault?.path}>
          <span className="rail-sync-line">{syncLine()}</span>
          <span className="rail-sync-where">{vault ? locationLabel(vault.path) : ''}</span>
        </div>
        <button type="button" className="btn btn-quiet btn-sm rail-lock" onClick={() => void api().vault.lock()}>
          <Lock /> Lock <Keycap>{modKey(app.platform)}L</Keycap>
        </button>
      </div>
      {menu}
    </nav>
  )
}

function RailRow({
  label,
  count,
  current,
  onSelect,
  onDrop,
  folderId,
  dropTarget,
  setDropTarget,
}: {
  label: string
  count: number
  current: boolean
  onSelect: () => void
  onDrop?: (event: React.DragEvent, folderId: string | null) => void
  folderId?: string | null
  dropTarget?: string | null
  setDropTarget?: (id: string | null) => void
}) {
  const droppable = Boolean(onDrop)
  return (
    <li>
      <div
        className={`rail-row${current ? ' is-current' : ''}${dropTarget === '__root__' ? ' is-drop' : ''}`}
        onDragOver={
          droppable
            ? (event) => {
                if (!event.dataTransfer.types.includes('application/x-passvault-entries')) return
                event.preventDefault()
                setDropTarget?.('__root__')
              }
            : undefined
        }
        onDragLeave={droppable ? () => setDropTarget?.(null) : undefined}
        onDrop={droppable ? (event) => onDrop?.(event, folderId ?? null) : undefined}
      >
        <button type="button" className="rail-name" onClick={onSelect}>
          {label}
        </button>
        <span className="rail-count">{count || ''}</span>
      </div>
    </li>
  )
}
