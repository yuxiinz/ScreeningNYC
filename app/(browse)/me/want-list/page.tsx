import Link from 'next/link'

import WantDirectorListSection from '@/components/me/want-list/WantDirectorListSection'
import WantFilmListSection from '@/components/me/want-list/WantFilmListSection'
import MovieCsvImportButton from '@/components/movie/MovieCsvImportButton'
import { requireUserIdForPage } from '@/lib/auth/require-user-id'
import {
  getMovieStatesForUser,
  getWantListPageData,
} from '@/lib/user-movies/service'
import { getWantDirectorListPageData } from '@/lib/user-directors/service'

const TAB_CLASS =
  'border-b-2 pb-[6px] text-[0.86rem] font-semibold tracking-[0.06em] transition-colors'

function getHeadline(totalCount: number, onScreenNowCount: number) {
  return `There ${totalCount === 1 ? 'is' : 'are'} ${totalCount} film${totalCount === 1 ? '' : 's'} you want to watch in theaters, ${onScreenNowCount} of them ${onScreenNowCount === 1 ? 'is' : 'are'} on screen in NYC now!`
}

function getDirectorHeadline(totalCount: number, onScreenNowCount: number) {
  return `There ${totalCount === 1 ? 'is' : 'are'} ${totalCount} director${totalCount === 1 ? '' : 's'} you want to follow, ${onScreenNowCount} of them ${onScreenNowCount === 1 ? 'currently has' : 'currently have'} films on screen in NYC now!`
}

export default async function WantListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const userId = await requireUserIdForPage('/me/want-list')

  const params = await searchParams
  const activeTab = params.tab === 'directors' ? 'directors' : 'films'
  const filmData =
    activeTab === 'films' ? await getWantListPageData(userId) : null
  const directorData =
    activeTab === 'directors'
      ? await getWantDirectorListPageData(userId)
      : null
  const movieStates = filmData
    ? await getMovieStatesForUser(
        userId,
        filmData.items.map((item) => item.movie.id)
      )
    : null

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/me" className="hover:text-text-primary">
            ME
          </Link>{' '}
          / WANT LIST
        </p>
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">
          WANT TO WATCH IN THEATERS
        </h1>
        <div className="mb-4 mt-5 flex gap-6">
          <Link
            href="/me/want-list?tab=films"
            className={[
              TAB_CLASS,
              activeTab === 'films'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-dim hover:text-text-primary',
            ].join(' ')}
          >
            FILMS
          </Link>
          <Link
            href="/me/want-list?tab=directors"
            className={[
              TAB_CLASS,
              activeTab === 'directors'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-dim hover:text-text-primary',
            ].join(' ')}
          >
            DIRECTORS
          </Link>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <p className="m-0 text-[0.98rem] leading-[1.6] text-text-secondary lg:max-w-[720px]">
            {activeTab === 'films'
              ? getHeadline(
                  filmData?.totalCount || 0,
                  filmData?.onScreenNowCount || 0
                )
              : getDirectorHeadline(
                  directorData?.totalCount || 0,
                  directorData?.onScreenNowCount || 0
                )}
          </p>
          {activeTab === 'films' ? (
            <MovieCsvImportButton listType="want" className="lg:w-[360px]" />
          ) : null}
        </div>
      </section>

      {activeTab === 'films' ? (
        <WantFilmListSection
          items={filmData?.items || []}
          movieStates={movieStates || new Map()}
        />
      ) : (
        <WantDirectorListSection items={directorData?.items || []} />
      )}
    </main>
  )
}
