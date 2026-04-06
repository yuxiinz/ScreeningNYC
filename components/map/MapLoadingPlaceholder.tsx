export default function MapLoadingPlaceholder() {
  return (
    <div
      className="flex h-[70vh] items-center justify-center rounded-[12px] border border-border-strong bg-card-bg px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="text-[0.95rem] text-text-muted">
        Loading map and theater locations...
      </p>
    </div>
  )
}
