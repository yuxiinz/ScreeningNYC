import Link from 'next/link'

import DirectorListActions from '@/components/person/DirectorListActions'
import PersonPhotoImage from '@/components/person/PersonPhotoImage'
import type { WantDirectorListPageData } from '@/lib/user-directors/service'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const DIRECTOR_PHOTO_CLASS =
  'flex aspect-[4/5] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'

type WantDirectorListSectionProps = {
  items: WantDirectorListPageData['items']
}

export default function WantDirectorListSection({
  items,
}: WantDirectorListSectionProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
        <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
          You have not added any directors to your want list yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {items.map((item) => (
        <article
          key={item.person.id}
          className="flex flex-wrap items-start gap-6 rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
        >
          <Link
            href={`/people/${item.person.id}`}
            className="shrink-0 text-inherit no-underline"
          >
            <div className={DIRECTOR_PHOTO_CLASS}>
              <PersonPhotoImage
                src={item.person.photoUrl || ''}
                alt={item.person.name}
                className="h-full w-full object-cover"
              />
            </div>
          </Link>

          <div className="min-w-[260px] flex-1">
            <h2 className="mb-2 text-[1.7rem] font-black leading-[1.08]">
              <Link
                href={`/people/${item.person.id}`}
                className="text-text-primary no-underline"
              >
                {item.person.name.toUpperCase()}
              </Link>
            </h2>

            <DirectorListActions
              personId={item.person.id}
              initialInWant
              className="mb-4"
            />

            {item.onScreenMovies.length > 0 ? (
              <div className="rounded-panel border border-border-default bg-page-bg px-4 py-3">
                <p className="mb-3 text-[0.72rem] font-semibold tracking-[0.1em] text-accent-positive">
                  FILMS ON SCREEN NOW
                </p>
                <div className="flex flex-col gap-3">
                  {item.onScreenMovies.map((movie) => {
                    const nextShowtime = movie.showtimes[0]

                    return (
                      <div key={movie.id}>
                        <p className="m-0 text-[0.92rem] font-semibold leading-[1.5] text-text-primary">
                          <Link
                            href={`/films/${movie.id}`}
                            className="text-text-primary no-underline"
                          >
                            {movie.title}
                          </Link>
                        </p>
                        {nextShowtime ? (
                          <p className="m-0 text-[0.84rem] leading-[1.6] text-text-body">
                            Next showtime:{' '}
                            {formatDateKeyInAppTimezone(
                              getDateKeyInAppTimezone(nextShowtime.startTime)
                            )}{' '}
                            at {formatTimeInAppTimezone(nextShowtime.startTime)} at{' '}
                            {nextShowtime.theater.name}.
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
                No films by this director are currently on screen in NYC.
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
