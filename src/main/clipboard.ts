import { clipboard } from 'electron'
import { createHash } from 'node:crypto'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * Copies values to the system clipboard and wipes secrets after a delay — but only
 * if the clipboard still holds what PassVault put there, so a newer copy made in
 * another app is never destroyed.
 */
export class ClipboardGuard {
  private timer: NodeJS.Timeout | null = null
  private ours: string | null = null

  constructor(private readonly notify: (state: 'copied' | 'cleared', label?: string, clearsAt?: number) => void) {}

  copy(value: string, label: string, clearAfterSeconds: number): number | null {
    clipboard.writeText(value)
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (clearAfterSeconds <= 0) {
      this.ours = null
      this.notify('copied', label)
      return null
    }
    this.ours = digest(value)
    const clearsAt = Date.now() + clearAfterSeconds * 1000
    this.timer = setTimeout(() => this.clearIfOurs(), clearAfterSeconds * 1000)
    this.notify('copied', label, clearsAt)
    return clearsAt
  }

  clearIfOurs(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const ours = this.ours
    this.ours = null
    if (!ours) return
    // readText is synchronous in older Electron releases and a promise in newer ones.
    void Promise.resolve(clipboard.readText()).then((current) => {
      if (digest(current) !== ours) return
      clipboard.clear()
      this.notify('cleared')
    })
  }
}
