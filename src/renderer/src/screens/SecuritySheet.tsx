import { X } from 'lucide-react'
import type { AppState, EntrySummary } from '../../../shared/types'
import { Rosette } from '../components/Rosette'
import { bytes, locationLabel, mebibytes, relativeTime, shortenPath } from '../lib/format'
import { vaultCode } from '../lib/rosette'
import type { Panel } from './VaultWindow'

/**
 * The specimen sheet: what actually protects this vault, in plain words, including
 * what it cannot protect against.
 */
export function SecuritySheet({
  app,
  entries,
  onClose,
  onPanel,
}: {
  app: AppState
  entries: EntrySummary[]
  onClose: () => void
  onPanel: (panel: Panel) => void
}) {
  const vault = app.vault
  if (!vault) return null
  const quick = app.quickUnlock[vault.vaultId]
  const live = entries.filter((entry) => !entry.trashedAt).length

  return (
    <section className="panel">
      <div className="panel-bar drag">
        <h1 className="panel-title">Vault security</h1>
        <button type="button" className="btn btn-quiet btn-icon btn-sm no-drag" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="panel-scroll">
        <div className="specimen">
          <Rosette id={vault.vaultId} size={148} />
          <div className="specimen-text">
            <h2 className="specimen-name">{vault.name}</h2>
            <p className="specimen-code mono">{vaultCode(vault.vaultId)}</p>
            <p className="specimen-body">
              This pattern is drawn from the vault’s own identifier. Open the same file on another computer and it draws the same rosette — a different
              pattern means a different vault.
            </p>
          </div>
        </div>

        <dl className="spec-list">
          <SpecRow label="File" value={shortenPath(vault.path, 64)} hint={`${locationLabel(vault.path)} · ${bytes(vault.sizeBytes)} · saved ${relativeTime(vault.lastSavedAt)}`} />
          <SpecRow label="Format" value={`PassVault ${vault.formatVersion}`} hint={`${live} ${live === 1 ? 'entry' : 'entries'} sealed inside one file. Its size is padded to 4 KiB steps, so the file does not reveal how much it holds.`} />
          <SpecRow
            label="Key derivation"
            value={`Argon2id · ${mebibytes(vault.kdf.memoryKiB)} · ${vault.kdf.iterations} passes · ${vault.kdf.parallelism} lane`}
            hint="Your master password is stretched into the vault key. Every guess an attacker makes costs them this much memory and time."
          />
          <SpecRow
            label="Encryption"
            value="XChaCha20-Poly1305"
            hint="A fresh 192-bit nonce on every save, with the file header authenticated separately — so a tampered header is caught before anything is decrypted, and a wrong password is told apart from a damaged file."
          />
          <SpecRow
            label="Sync"
            value="Your folder, your sync tool"
            hint="PassVault watches the file. When another device writes to it, the two versions are merged and a losing edit is kept in that entry’s history rather than dropped."
          />
          <SpecRow
            label="Biometric unlock"
            value={
              quick?.enrolled
                ? quick.mode === 'device'
                  ? 'On · key held by this device’s keystore'
                  : 'On · key held in memory until PassVault quits'
                : 'Off'
            }
            hint={
              quick?.enrolled
                ? 'The key is released only after the system verifies you, and never travels with the vault file. Your master password is still required when it expires.'
                : app.biometrics.reason ?? 'Turn it on in Settings to unlock without typing your master password every time.'
            }
          />
          <SpecRow
            label="On screen"
            value={app.settings.hideFromScreenCapture ? 'Hidden from screen capture' : 'Visible to screen capture'}
            hint={`Secrets stay sealed until you reveal or copy them, and a revealed value re-seals itself after 30 seconds. ${
              app.settings.clipboardClearSeconds
                ? `Copies clear from the clipboard after ${app.settings.clipboardClearSeconds} seconds.`
                : 'Clipboard clearing is off, so a copied secret stays there until something replaces it.'
            }`}
          />
        </dl>

        <section className="limits">
          <h2 className="caps">What this does not protect against</h2>
          <ul>
            <li>Malware running as you while the vault is unlocked. It can read what the app can read.</li>
            <li>Clipboard managers and Windows clipboard history, which may keep their own copy of anything you paste.</li>
            <li>Memory forensics. JavaScript cannot guarantee wiping a secret from memory, which is why PassVault locks when idle and reloads its windows.</li>
            <li>A weak master password. Argon2id makes guessing expensive, not impossible.</li>
            <li>A lost master password. Nobody can recover the vault without it — there is no backdoor and no reset.</li>
          </ul>
        </section>

        <div className="panel-actions">
          <button type="button" className="btn" onClick={() => onPanel('settings')}>
            Change master password
          </button>
          <button type="button" className="btn" onClick={() => void window.passvault.vault.showInFolder()}>
            {app.platform === 'darwin' ? 'Show file in Finder' : 'Show file in Explorer'}
          </button>
        </div>
      </div>
    </section>
  )
}

function SpecRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="spec-row">
      <dt className="spec-label caps">{label}</dt>
      <dd className="spec-value">
        <p className="spec-headline mono">{value}</p>
        <p className="spec-hint">{hint}</p>
      </dd>
    </div>
  )
}
