import { Check } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { StrengthEstimate } from '../../../shared/types'
import { dismissNotice, useStore } from '../store'

// ------------------------------------------------------------------- switches

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

// ---------------------------------------------------------------------- menu

export interface MenuItem {
  label?: string
  onSelect?: () => void
  hint?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  separator?: boolean
}

interface MenuRequest {
  x: number
  y: number
  items: MenuItem[]
  align: 'start' | 'end'
  minWidth?: number
}

export function useMenu() {
  const [request, setRequest] = useState<MenuRequest | null>(null)
  const close = useCallback(() => setRequest(null), [])

  const openAt = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => {
    event.preventDefault()
    setRequest({ x: event.clientX, y: event.clientY, items, align: 'start' })
  }, [])

  const openUnder = useCallback((element: HTMLElement | null, items: MenuItem[], align: 'start' | 'end' = 'start') => {
    if (!element) return
    const rect = element.getBoundingClientRect()
    setRequest({ x: align === 'end' ? rect.right : rect.left, y: rect.bottom + 4, items, align, minWidth: rect.width })
  }, [])

  const menu = request ? <MenuSurface request={request} onClose={close} /> : null
  return { menu, openAt, openUnder, close, isOpen: request !== null }
}

function MenuSurface({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: request.x, top: request.y, ready: false })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    let left = request.align === 'end' ? request.x - rect.width : request.x
    let top = request.y
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, request.y - rect.height - 8)
    setPosition({ left: Math.max(8, left), top, ready: true })
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [request])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return createPortal(
    <div
      className="menu"
      role="menu"
      ref={ref}
      onKeyDown={onKeyDown}
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden', minWidth: request.minWidth }}
    >
      {request.items.map((item, index) =>
        item.separator ? (
          <div key={index} className="menu-sep" role="separator" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect?.()
            }}
          >
            <span className="menu-label">{item.label}</span>
            {item.checked ? <Check className="menu-check" /> : null}
            {item.hint ? <span className="menu-hint mono">{item.hint}</span> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------------- dialogs

export interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const element = request ? <ConfirmDialog request={request} onClose={() => setRequest(null)} /> : null
  return { confirm: setRequest, element }
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog className="dialog" ref={ref} onCancel={onClose} onClose={onClose}>
      <h2>{request.title}</h2>
      {request.body ? <p>{request.body}</p> : null}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            onClose()
            request.onConfirm()
          }}
          autoFocus
        >
          {request.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

/** Reads a secret out loud-sized, in numbered cells, for typing on another device. */
export function LargeType({ value, label, onClose }: { value: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog className="dialog dialog-large" ref={ref} onCancel={onClose} onClose={onClose}>
      <h2 className="caps">{label}</h2>
      <div className="large-type">
        {[...value].map((char, index) => (
          <span key={index} className="large-char" data-kind={/\d/.test(char) ? 'digit' : /[a-z]/i.test(char) ? 'letter' : 'symbol'}>
            <span className="large-glyph mono">{char === ' ' ? '␣' : char}</span>
            <span className="large-index mono">{index + 1}</span>
          </span>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </dialog>
  )
}

// ------------------------------------------------------------------ strength

const SCORE_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']

export function StrengthMeter({ estimate, empty }: { estimate: StrengthEstimate | null; empty: boolean }) {
  const score = empty || !estimate ? -1 : estimate.score
  return (
    <div className="strength" data-score={score}>
      <div className="strength-cells" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} data-on={index <= score} />
        ))}
      </div>
      <p className="strength-text">
        {score < 0 || !estimate ? (
          'Several unrelated words beat a short clever one.'
        ) : (
          <>
            <strong>{SCORE_LABELS[score]}</strong>
            <span className="strength-time">
              {estimate.crackTime === 'instantly' ? ' · guessed instantly offline' : ` · about ${estimate.crackTime} to guess offline`}
            </span>
          </>
        )}
      </p>
      {estimate?.warning && score >= 0 ? <p className="strength-note">{estimate.warning}</p> : null}
      {!estimate?.warning && estimate?.suggestions.length && score >= 0 ? <p className="strength-note">{estimate.suggestions[0]}</p> : null}
    </div>
  )
}

// ------------------------------------------------------------- status strips

export function CopyReceipt() {
  const receipt = useStore((s) => s.clipboard)
  const [now, setNow] = useState(() => Date.now())
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    if (!receipt) return
    if (!receipt.clearsAt) {
      const timer = setTimeout(() => setHidden(true), 2400)
      return () => clearTimeout(timer)
    }
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [receipt])

  if (!receipt || hidden) return null
  const remaining = receipt.clearsAt ? Math.max(0, Math.ceil((receipt.clearsAt - now) / 1000)) : null
  return (
    <div className="receipt" role="status">
      <span className="receipt-label">{receipt.label} copied</span>
      {remaining === null ? null : (
        <span className="receipt-count mono">
          clears in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      )}
    </div>
  )
}

export function NoticeLine() {
  const notice = useStore((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => dismissNotice(notice.id), notice.action ? 9000 : 6000)
    return () => clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  return (
    <div className={`notice${notice.tone === 'alert' ? ' is-alert' : ''}`} role="status">
      <span>{notice.text}</span>
      {notice.action ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => {
            dismissNotice(notice.id)
            notice.action?.run()
          }}
        >
          {notice.action.label}
        </button>
      ) : null}
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => dismissNotice(notice.id)}>
        Dismiss
      </button>
    </div>
  )
}
