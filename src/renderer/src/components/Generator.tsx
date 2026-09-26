import { RefreshCw } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GeneratorOptions } from '../../../shared/types'
import { api } from '../store'
import { Segmented, Switch } from './ui'

export const GENERATOR_DEFAULTS: GeneratorOptions = {
  mode: 'characters',
  length: 24,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
  words: 5,
  separator: '-',
  capitalize: false,
  includeNumber: false,
}

export function GeneratorPanel({ anchor, onUse, onClose }: { anchor: HTMLElement | null; onUse: (value: string) => void; onClose: () => void }) {
  const [options, setOptions] = useState<GeneratorOptions>(GENERATOR_DEFAULTS)
  const [value, setValue] = useState('')
  const [entropy, setEntropy] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })

  const regenerate = async (next: GeneratorOptions) => {
    const result = await api().generator.generate(next)
    setValue(result.value)
    setEntropy(result.entropyBits)
  }

  useEffect(() => {
    void regenerate(options)
  }, [options])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    let left = Math.min(anchorRect.left, window.innerWidth - rect.width - 12)
    let top = anchorRect.bottom + 6
    if (top + rect.height > window.innerHeight - 12) top = Math.max(12, anchorRect.top - rect.height - 6)
    setPosition({ left: Math.max(12, left), top, ready: true })
  }, [anchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node) && event.target !== anchor) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [anchor, onClose])

  const patch = (next: Partial<GeneratorOptions>) => setOptions((current) => ({ ...current, ...next }))

  return createPortal(
    <div className="generator" ref={ref} style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }} role="dialog" aria-label="Generate a secret">
      <div className="generator-preview">
        <span className="generator-value mono selectable">{value}</span>
        <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Generate another" onClick={() => void regenerate(options)}>
          <RefreshCw />
        </button>
      </div>

      <Segmented
        label="Kind of secret"
        value={options.mode}
        onChange={(mode) => patch({ mode })}
        options={[
          { value: 'characters', label: 'Characters' },
          { value: 'passphrase', label: 'Words' },
        ]}
      />

      {options.mode === 'characters' ? (
        <>
          <label className="generator-range">
            <span>Length</span>
            <input type="range" min={8} max={64} value={options.length} onChange={(event) => patch({ length: Number(event.target.value) })} />
            <span className="mono generator-number">{options.length}</span>
          </label>
          <div className="generator-toggles">
            <Check label="A–Z" checked={options.upper} onChange={(upper) => patch({ upper })} />
            <Check label="a–z" checked={options.lower} onChange={(lower) => patch({ lower })} />
            <Check label="0–9" checked={options.digits} onChange={(digits) => patch({ digits })} />
            <Check label="!#$%" checked={options.symbols} onChange={(symbols) => patch({ symbols })} />
          </div>
          <Check label="Skip look-alikes (I l 1 O 0)" checked={options.avoidAmbiguous} onChange={(avoidAmbiguous) => patch({ avoidAmbiguous })} />
        </>
      ) : (
        <>
          <label className="generator-range">
            <span>Words</span>
            <input type="range" min={3} max={10} value={options.words} onChange={(event) => patch({ words: Number(event.target.value) })} />
            <span className="mono generator-number">{options.words}</span>
          </label>
          <label className="generator-row">
            <span>Between words</span>
            <select className="input generator-select" value={options.separator} onChange={(event) => patch({ separator: event.target.value })}>
              <option value="-">hyphen -</option>
              <option value=".">dot .</option>
              <option value="_">underscore _</option>
              <option value=" ">space</option>
            </select>
          </label>
          <div className="generator-switches">
            <label className="generator-row">
              <span>Capitalise</span>
              <Switch label="Capitalise words" checked={options.capitalize} onChange={(capitalize) => patch({ capitalize })} />
            </label>
            <label className="generator-row">
              <span>Add a number</span>
              <Switch label="Add a number" checked={options.includeNumber} onChange={(includeNumber) => patch({ includeNumber })} />
            </label>
          </div>
        </>
      )}

      <div className="generator-foot">
        <span className="generator-entropy mono">{entropy} bits</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            onUse(value)
            onClose()
          }}
        >
          Use this
        </button>
      </div>
    </div>,
    document.body,
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
