import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, EntryType } from '../../../shared/types'
import { CopyReceipt, NoticeLine, useConfirm } from '../components/ui'
import { runPrimary } from '../lib/actions'
import { searchEntries } from '../lib/search'
import { matchesView, type View } from '../lib/views'
import { api, onCommand, useStore } from '../store'
import { EntryEditor } from './EntryEditor'
import { EntryIndex } from './EntryIndex'
import { EntryPane, PaneEmpty } from './EntryPane'
import { ImportKdbx } from './ImportKdbx'
import { Rail } from './Rail'
import { SecuritySheet } from './SecuritySheet'
import { Settings } from './Settings'

export type Panel = 'settings' | 'security' | 'import' | null
type Mode = { kind: 'view' } | { kind: 'edit'; id: string } | { kind: 'new'; type: EntryType }

export function VaultWindow({ app }: { app: AppState }) {
  const index = useStore((s) => s.index)
  const [view, setView] = useState<View>({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [panel, setPanel] = useState<Panel>(null)
  const [sort, setSort] = useState<'title' | 'updated'>('title')
  const searchRef = useRef<HTMLInputElement>(null)
  const { confirm, element: confirmElement } = useConfirm()

  const entries = useMemo(() => index?.entries ?? [], [index])
  const folders = useMemo(() => index?.folders ?? [], [index])

  const list = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed) return searchEntries(entries.filter((entry) => !entry.trashedAt), trimmed)
    const filtered = entries.filter((entry) => matchesView(entry, view))
    filtered.sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt))
    return filtered
  }, [entries, view, query, sort])

  // Keep a valid selection as the list changes underneath.
  useEffect(() => {
    if (mode.kind !== 'view') return
    if (selectedId && list.some((entry) => entry.id === selectedId)) return
    setSelectedId(list[0]?.id ?? null)
  }, [list, selectedId, mode.kind])

  const startNew = (type: EntryType) => {
    setPanel(null)
    setMode({ kind: 'new', type })
  }

  const goTo = (next: View) => {
    setPanel(null)
    setMode({ kind: 'view' })
    setQuery('')
    setView(next)
  }

  useEffect(
    () =>
      onCommand((command) => {
        if (typeof command === 'object') {
          setPanel(null)
          setMode({ kind: 'view' })
          setQuery('')
          setView({ kind: 'all' })
          setSelectedId(command.focus)
          return
        }
        if (command === 'new-entry') startNew('login')
        if (command === 'search') {
          setPanel(null)
          searchRef.current?.focus()
          searchRef.current?.select()
        }
        if (command === 'settings') setPanel('settings')
        if (command === 'security') setPanel('security')
        if (command === 'import') setPanel('import')
      }),
    [],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPanel(null)
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (mod && event.key.toLowerCase() === 'n' && !event.shiftKey) {
        event.preventDefault()
        startNew('login')
      }
      if (mod && event.key.toLowerCase() === 'e' && selectedId) {
        event.preventDefault()
        setPanel(null)
        setMode({ kind: 'edit', id: selectedId })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const selected = selectedId ? list.find((entry) => entry.id === selectedId) ?? entries.find((entry) => entry.id === selectedId) : undefined

  return (
    <div className="vault">
      <Rail app={app} entries={entries} folders={folders} view={view} panel={panel} onView={goTo} onPanel={setPanel} confirm={confirm} />

      {panel === 'settings' ? (
        <Settings app={app} onClose={() => setPanel(null)} onPanel={setPanel} confirm={confirm} />
      ) : panel === 'security' ? (
        <SecuritySheet app={app} entries={entries} onClose={() => setPanel(null)} onPanel={setPanel} />
      ) : panel === 'import' ? (
        <ImportKdbx
          onClose={() => setPanel(null)}
          onImported={(folderName) => {
            const folder = folders.find((candidate) => candidate.name === folderName)
            if (folder) goTo({ kind: 'folder', id: folder.id })
            else goTo({ kind: 'all' })
          }}
        />
      ) : (
        <>
          <EntryIndex
            app={app}
            list={list}
            folders={folders}
            view={view}
            query={query}
            sort={sort}
            searchRef={searchRef}
            selectedId={selectedId}
            editing={mode.kind !== 'view'}
            onQuery={setQuery}
            onSort={setSort}
            onSelect={(id) => {
              setSelectedId(id)
              setMode({ kind: 'view' })
            }}
            onPrimary={(entry) => void runPrimary(entry)}
            onNew={startNew}
            confirm={confirm}
          />

          {mode.kind === 'new' ? (
            <EntryEditor
              key="new"
              mode="new"
              type={mode.type}
              folders={folders}
              defaultFolderId={view.kind === 'folder' ? view.id : null}
              onDone={(id) => {
                setMode({ kind: 'view' })
                if (id) setSelectedId(id)
              }}
              onCancel={() => setMode({ kind: 'view' })}
            />
          ) : mode.kind === 'edit' ? (
            <EntryEditor
              key={`edit-${mode.id}`}
              mode="edit"
              entryId={mode.id}
              folders={folders}
              onDone={() => setMode({ kind: 'view' })}
              onCancel={() => setMode({ kind: 'view' })}
            />
          ) : selected ? (
            <EntryPane
              key={selected.id}
              entryId={selected.id}
              app={app}
              folders={folders}
              onEdit={() => setMode({ kind: 'edit', id: selected.id })}
              onView={goTo}
              confirm={confirm}
            />
          ) : (
            <PaneEmpty app={app} entries={entries} folders={folders} onNew={startNew} onPanel={setPanel} view={view} query={query} />
          )}
        </>
      )}

      <CopyReceipt />
      <NoticeLine />
      {confirmElement}
    </div>
  )
}

export async function lockVault() {
  await api().vault.lock()
}
