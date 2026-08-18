import { STEP_LABELS } from '../types'

interface StepNavProps {
  step: number
  onJump?: (step: number) => void
}

export function StepNav({ step, onJump }: StepNavProps) {
  return (
    <nav className="step-nav" aria-label="流程步骤">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const state = n < step ? 'done' : n === step ? 'current' : 'todo'
        return (
          <button
            key={label}
            type="button"
            className={`step-pill step-${state}`}
            onClick={() => onJump?.(n)}
            disabled={n > step}
          >
            <span className="step-num">{n}</span>
            <span className="step-text">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
