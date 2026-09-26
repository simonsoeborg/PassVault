import { useMemo } from 'react'
import { rosetteFor } from '../lib/rosette'

export type RosetteState = 'locked' | 'deriving' | 'registered' | 'knock'

interface RosetteProps {
  id: string
  size: number
  state?: RosetteState
  className?: string
}

/** The vault's printed fingerprint. Two layers sit out of register while locked and align on unlock. */
export function Rosette({ id, size, state = 'registered', className }: RosetteProps) {
  const geometry = useMemo(() => rosetteFor(id, size >= 120 ? 'full' : 'small'), [id, size])
  return (
    <svg
      className={`rosette${className ? ` ${className}` : ''}`}
      data-state={state}
      data-size={size >= 120 ? 'full' : 'small'}
      width={size}
      height={size}
      viewBox="-100 -100 200 200"
      aria-hidden="true"
    >
      <g className="rosette-ring">
        {geometry.ring.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="rosette-b">
        <path d={geometry.b} />
      </g>
      <g className="rosette-a">
        <path d={geometry.a} />
      </g>
    </svg>
  )
}
