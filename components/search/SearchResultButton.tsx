import type { ReactNode } from 'react'

type SearchResultButtonProps = {
  children: ReactNode
  className?: string
  disabled?: boolean
  disabledClassName?: string
  isLast: boolean
  onClick: () => void
}

export default function SearchResultButton({
  children,
  className,
  disabled = false,
  disabledClassName = 'disabled:cursor-not-allowed disabled:opacity-60',
  isLast,
  onClick,
}: SearchResultButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg',
        disabled ? disabledClassName : '',
        isLast ? 'border-none' : 'border-b border-border-subtle',
        className || '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
