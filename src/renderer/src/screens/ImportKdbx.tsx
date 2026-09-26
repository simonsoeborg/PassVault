import { Check, FileDown, X } from 'lucide-react'
import { useState } from 'react'
import type { ImportReport } from '../../../shared/types'
import { api, refreshIndex } from '../store'

export function ImportKdbx({ onClose, onImported }: { onClose: () => void; onImported: (folderName: string) => void }) {
  const [path, setPath] = useState<string | null>(null)
  const [keyFilePath, setKeyFilePath] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  const fileName = path?.split(/[\\/]/).pop() ?? null

  const run = async () => {
    if (!path) return
    setBusy(true)
    setError(null)
    const result = await api().importer.kdbx({ path, password, keyFilePath: keyFilePath ?? undefined })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setPassword('')
    setReport(result.value)
    await refreshIndex()
  }

  return (
    <section className="panel">
      <div className="panel-bar drag">
        <h1 className="panel-title">Import from KeePass</h1>
        <button type="button" className="btn btn-quiet btn-icon btn-sm no-drag" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="panel-scroll">
        {report ? (
          <div className="import-done">
            <p className="import-done-title">
              <Check /> Imported into “{report.folderName}”
            </p>
            <p className="import-done-source caps">
              From a {report.format === 'kdb' ? 'KeePass 1' : 'KeePass 2'} database · <span className="mono">.{report.format}</span>
            </p>
            <dl className="import-figures">
              <div>
                <dt className="caps">Entries</dt>
                <dd className="mono">{report.entries}</dd>
              </div>
              <div>
                <dt className="caps">Folders</dt>
                <dd className="mono">{report.folders}</dd>
              </div>
              <div>
                <dt className="caps">SSH hosts</dt>
                <dd className="mono">{report.ssh}</dd>
              </div>
              <div>
                <dt className="caps">TOTP codes</dt>
                <dd className="mono">{report.totp}</dd>
              </div>
              <div>
                <dt className="caps">Skipped</dt>
                <dd className="mono">{report.skipped}</dd>
              </div>
            </dl>
            <p className="import-note">
              {report.format === 'kdb'
                ? 'KeePass 1 keeps old copies of entries in a group named Backup, which imported as an ordinary folder rather than as Trash.'
                : 'Entries from the KeePass recycle bin landed in Trash.'}{' '}
              Attached private keys became SSH entries; PuTTY .ppk attachments were kept as sealed fields, since PassVault loads OpenSSH and PEM keys
              into the agent.
              {report.attachmentsSkipped > 0
                ? ` ${report.attachmentsSkipped} other ${report.attachmentsSkipped === 1 ? 'attachment' : 'attachments'} stayed in the original file, which is untouched: this vault stores text, not files.`
                : ''}
            </p>
            <div className="panel-actions">
              <button type="button" className="btn btn-primary" onClick={() => onImported(report.folderName)}>
                Show the imported entries
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            className="import-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (path && !busy) void run()
            }}
          >
            <p className="import-intro">
              Your KeePass database is read once and copied into this vault — <span className="mono">.kdbx</span> from KeePass 2, or{' '}
              <span className="mono">.kdb</span> from KeePass 1. The original file is never changed, and nothing is sent anywhere.
            </p>

            <div className="form-row">
              <span className="form-label caps">Database</span>
              <div className="settings-inline">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const picked = await api().importer.chooseFile('kdbx')
                    if (picked) {
                      setPath(picked)
                      setError(null)
                    }
                  }}
                >
                  <FileDown /> Choose database file…
                </button>
                <span className="import-file mono">{fileName ?? 'No file chosen'}</span>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label caps" htmlFor="kdbx-password">
                Its password
              </label>
              <input
                id="kdbx-password"
                className="input"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </div>

            <div className="form-row">
              <span className="form-label caps">Key file</span>
              <div className="settings-inline">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const picked = await api().importer.chooseFile('keyfile')
                    if (picked) setKeyFilePath(picked)
                  }}
                >
                  Choose key file…
                </button>
                <span className="import-file mono">{keyFilePath ? (keyFilePath.split(/[\\/]/).pop() ?? '') : 'Only if your database uses one'}</span>
                {keyFilePath ? (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setKeyFilePath(null)}>
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="panel-actions">
              <button type="submit" className="btn btn-primary" disabled={!path || busy} aria-busy={busy}>
                {busy ? 'Reading the database…' : 'Import'}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
