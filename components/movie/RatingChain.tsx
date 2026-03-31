'use client'

type RatingChainProps = {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  className?: string
}

const SCORE_VALUES = [0, 1, 2, 3, 4, 5] as const

export default function RatingChain({
  value,
  onChange,
  disabled = false,
  className,
}: RatingChainProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-stretch gap-3">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={[
            'rounded-panel border px-4 py-2 text-[0.82rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === null
              ? 'border-text-primary bg-text-primary text-page-bg'
              : 'border-border-input text-text-secondary hover:border-text-primary hover:text-text-primary',
          ].join(' ')}
        >
          No rating
        </button>

        <div className="inline-flex overflow-hidden rounded-panel border border-border-input">
          {SCORE_VALUES.map((score) => {
            const isSelected = value === score
            const isActive = typeof value === 'number' && score <= value

            return (
              <button
                key={score}
                type="button"
                onClick={() => onChange(score)}
                disabled={disabled}
                className={[
                  'min-w-[52px] border-r border-border-input px-0 py-2 text-[0.82rem] font-semibold transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'bg-accent-positive text-page-bg'
                    : isActive
                      ? 'bg-[#11361a] text-[#c5ffd0]'
                      : 'bg-page-bg text-text-secondary hover:bg-card-bg hover:text-text-primary',
                ].join(' ')}
                aria-pressed={isSelected}
                aria-label={`Rate ${score} out of 5`}
              >
                {score}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
