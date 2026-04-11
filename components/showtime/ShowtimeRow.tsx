import { getShowtimeDisplayTitle } from '@/lib/showtime/display'
import { isFreeTicketValue } from '@/lib/showtime/ticket'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const ROW_CLASS =
  'flex flex-wrap items-start justify-between gap-4 rounded-panel border border-border-default bg-card-bg px-5 py-[15px]'
const META_CLASS = 'flex flex-wrap items-baseline gap-5'
const DATE_CLASS =
  'mb-1 text-[0.74rem] font-semibold tracking-[0.08em] text-text-dim'
const TITLE_CLASS = 'mb-1 text-[0.82rem] leading-[1.4] text-text-soft'
const TIME_CLASS = 'font-mono text-[1.2rem] font-bold'
const DETAIL_CLASS = 'text-[0.85rem] text-text-dim'
const DEFAULT_THEATER_CLASS = 'text-[0.9rem] text-text-muted'
const FREE_CLASS = 'whitespace-nowrap text-[0.8rem] font-bold text-accent-positive'
const SOLD_OUT_CLASS = 'whitespace-nowrap text-[0.8rem] text-text-disabled'
const DEFAULT_TICKET_LINK_CLASS =
  'whitespace-nowrap border-b border-text-primary text-[0.8rem] text-text-primary opacity-75 no-underline'

export type ShowtimeRowItem = {
  id: number
  startTime: Date
  runtimeMinutes: number | null
  ticketUrl: string | null
  shownTitle: string | null
  theater: {
    name: string
  }
  format: {
    name: string
  } | null
}

type ShowtimeRowProps = {
  fallbackFormatName?: string | null
  fallbackRuntimeMinutes?: number | null
  movieTitle: string
  showDate?: boolean
  showtime: ShowtimeRowItem
  theaterClassName?: string
  ticketLinkClassName?: string
}

export default function ShowtimeRow({
  fallbackFormatName,
  fallbackRuntimeMinutes,
  movieTitle,
  showDate = false,
  showtime,
  theaterClassName = DEFAULT_THEATER_CLASS,
  ticketLinkClassName = DEFAULT_TICKET_LINK_CLASS,
}: ShowtimeRowProps) {
  const displayTitle = getShowtimeDisplayTitle(showtime.shownTitle, movieTitle)
  const dateLabel = showDate
    ? formatDateKeyInAppTimezone(getDateKeyInAppTimezone(showtime.startTime))
    : ''
  const runtimeMinutes = showtime.runtimeMinutes || fallbackRuntimeMinutes
  const formatName = showtime.format?.name || fallbackFormatName

  return (
    <div className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        {dateLabel ? <p className={DATE_CLASS}>{dateLabel}</p> : null}
        {displayTitle ? <p className={TITLE_CLASS}>{displayTitle}</p> : null}

        <div className={META_CLASS}>
          <span className={TIME_CLASS}>
            {formatTimeInAppTimezone(showtime.startTime)}
          </span>

          <span className={theaterClassName}>
            {showtime.theater.name.toUpperCase()}
          </span>

          {runtimeMinutes ? (
            <span className={DETAIL_CLASS}>{runtimeMinutes} MIN</span>
          ) : null}

          {formatName ? (
            <span className={DETAIL_CLASS}>{formatName.toUpperCase()}</span>
          ) : null}
        </div>
      </div>

      {isFreeTicketValue(showtime.ticketUrl) ? (
        <span className={FREE_CLASS}>FREE</span>
      ) : showtime.ticketUrl ? (
        <a
          href={showtime.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={ticketLinkClassName}
        >
          TICKETS ↗
        </a>
      ) : (
        <span className={SOLD_OUT_CLASS}>SOLD OUT</span>
      )}
    </div>
  )
}
