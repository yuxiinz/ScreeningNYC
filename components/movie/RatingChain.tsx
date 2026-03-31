'use client'

import { useId, useState } from 'react'

type RatingChainProps = {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  className?: string
}

const SCORE_VALUES = [0, 1, 2, 3, 4, 5] as const

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function RatingChain({
  value,
  onChange,
  disabled = false,
  className,
}: RatingChainProps) {
  const inputId = useId()
  const [focused, setFocused] = useState(false)
  const sliderValue = value ?? 0
  const sliderPercent = (sliderValue / 5) * 100

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={[
            'rounded-panel border px-4 py-2 text-[0.82rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[124px]',
            value === null
              ? 'border-text-primary bg-text-primary text-page-bg'
              : 'border-border-input text-text-secondary hover:border-text-primary hover:text-text-primary',
          ].join(' ')}
        >
          No rating
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={[
              'rounded-panel border border-border-input bg-page-bg px-4 py-4 transition-shadow',
              focused ? 'shadow-[0_0_0_1px_rgba(21,255,45,0.45)]' : '',
              disabled ? 'opacity-60' : '',
            ].join(' ')}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <label
                htmlFor={inputId}
                className="text-[0.76rem] font-semibold tracking-[0.08em] text-text-dim"
              >
                DRAG TO RATE
              </label>
              <p className="m-0 text-[0.82rem] font-semibold text-text-primary">
                {value === null ? 'No rating' : `${formatScore(value)} / 5`}
              </p>
            </div>

            <div className="relative py-3">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-input" />
              {value !== null ? (
                <div
                  className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-accent-positive"
                  style={{
                    width: `${sliderPercent}%`,
                  }}
                />
              ) : null}

              {SCORE_VALUES.map((score) => {
                const left = `${(score / 5) * 100}%`
                const isActive = value !== null && score <= value

                return (
                  <div
                    key={score}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left }}
                  >
                    <div
                      className={[
                        'h-2.5 w-2.5 rounded-full border transition-colors',
                        isActive
                          ? 'border-accent-positive bg-accent-positive'
                          : 'border-border-input bg-card-bg',
                      ].join(' ')}
                    />
                  </div>
                )
              })}

              <div
                className={[
                  'absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] border shadow-[0_0_0_3px_rgba(18,54,26,0.28)] transition-colors',
                  value === null
                    ? 'border-border-input bg-card-bg'
                    : 'border-accent-positive bg-accent-positive',
                ].join(' ')}
                style={{ left: `${sliderPercent}%` }}
              />

              <input
                id={inputId}
                type="range"
                min={0}
                max={10}
                step={1}
                value={Math.round(sliderValue * 2)}
                onChange={(event) => {
                  onChange(Number(event.target.value) / 2)
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={disabled}
                aria-label="Rating from 0 to 5 in 0.5 increments"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[0.76rem] font-semibold text-text-dim">
              {SCORE_VALUES.map((score) => (
                <span key={score}>{score}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
