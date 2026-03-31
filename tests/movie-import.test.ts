import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  detectCsvProvider,
  parseDoubanCsv,
  parseFlexibleRating,
  parseLetterboxdCsv,
} from '../lib/user-movies/import-parser'

test('detectCsvProvider recognizes Douban headers', () => {
  const provider = detectCsvProvider(['封面', '标题', '打分日期', '条目链接'])

  assert.equal(provider, 'douban')
})

test('parseDoubanCsv splits multilingual titles and keeps countries', () => {
  const csv = [
    '封面\t标题\t个人评分\t打分日期\t我的短评\t上映日期\t制片国家\t条目链接',
    'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1371691835.jpg\t秘密/Secret/Himitsu\t3\t2026/03/28\tTest review\t1999/09/25\t日本\thttps://movie.douban.com/subject/1305084/',
  ].join('\n')

  const rows = parseDoubanCsv(csv)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, '秘密')
  assert.deepEqual(rows[0].titleCandidates, ['秘密', 'Secret', 'Himitsu'])
  assert.equal(rows[0].rating, 3)
  assert.equal(rows[0].productionCountriesText, '日本')
  assert.equal(rows[0].releaseDate?.toISOString(), '1999-09-25T12:00:00.000Z')
})

test('parseLetterboxdCsv preserves half-star ratings', () => {
  const csv = [
    'LetterboxdURI,tmdbID,imdbID,Title,Year,Directors,Rating,WatchedDate,Review',
    'https://letterboxd.com/film/test/,603,tt0133093,The Matrix,1999,"Lana Wachowski, Lilly Wachowski",4.5,2026-03-28,Still great',
  ].join('\n')

  const rows = parseLetterboxdCsv(csv)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].tmdbId, 603)
  assert.equal(rows[0].rating, 4.5)
  assert.equal(rows[0].directorText, 'Lana Wachowski, Lilly Wachowski')
})

test('parseFlexibleRating rejects unsupported increments', () => {
  assert.equal(parseFlexibleRating('3.7'), undefined)
  assert.equal(parseFlexibleRating('5.5'), undefined)
  assert.equal(parseFlexibleRating('4.5'), 4.5)
})
